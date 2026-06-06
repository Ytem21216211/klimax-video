import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// RCCLO Statistical Modeling Engine
// Modes: normalize | regress | optimize | score | predict | full
// ============================================================================

const FEATURE_KEYS = [
    'clip_count', 'avg_clip_duration', 'cut_frequency', 'zoom_frequency',
    'transition_diversity', 'sfx_density', 'subtitle_style_intensity',
    'subtitle_words_per_second', 'subtitle_avg_chunk_length',
    'word_complexity_score', 'syllables_per_second',
] as const;

const INTERACTION_TERMS = [
    ['cut_frequency', 'subtitle_words_per_second'],
    ['clip_count', 'cut_frequency'],
    ['subtitle_words_per_second', 'word_complexity_score'],
] as const;

// Domain groupings for scoring
const DOMAINS = {
    visual_complexity: ['clip_count', 'transition_diversity', 'sfx_density', 'subtitle_style_intensity'],
    motion_intensity: ['cut_frequency', 'zoom_frequency', 'avg_clip_duration'],
    linguistic_density: ['subtitle_words_per_second', 'word_complexity_score', 'syllables_per_second', 'subtitle_avg_chunk_length'],
};

const MIN_SAMPLES = 200;
const SMOOTHING_FACTOR = 0.70;
const ROLLING_WINDOW_DAYS = 60;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
function mean(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[], m?: number): number {
    if (arr.length < 2) return 1;
    const avg = m ?? mean(arr);
    const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance) || 1; // avoid 0
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function zNormalize(value: number, m: number, s: number): number {
    return s > 0 ? (value - m) / s : 0;
}

// Simple OLS for single-output regression
function multipleLinearRegression(
    X: number[][],  // N x K feature matrix
    y: number[],    // N targets
): { coefficients: number[]; intercept: number; rSquared: number; predicted: number[] } | null {
    const n = X.length;
    if (n < 10 || X[0].length === 0) return null;
    const k = X[0].length;

    const yMean = mean(y);

    // Add intercept column (prepend 1s)
    const X1 = X.map(row => [1, ...row]);
    const k1 = k + 1;

    // X^T * X
    const XtX: number[][] = Array.from({ length: k1 }, () => new Array(k1).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < k1; j++) {
            for (let l = 0; l < k1; l++) {
                XtX[j][l] += X1[i][j] * X1[i][l];
            }
        }
    }

    // X^T * y
    const Xty = new Array(k1).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < k1; j++) {
            Xty[j] += X1[i][j] * y[i];
        }
    }

    // Solve via Gauss-Jordan elimination
    const aug: number[][] = XtX.map((row, i) => [...row, Xty[i]]);

    for (let col = 0; col < k1; col++) {
        // Find pivot
        let maxRow = col;
        for (let row = col + 1; row < k1; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
        }
        [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

        const pivot = aug[col][col];
        if (Math.abs(pivot) < 1e-12) return null; // Singular

        for (let j = col; j <= k1; j++) aug[col][j] /= pivot;

        for (let row = 0; row < k1; row++) {
            if (row === col) continue;
            const factor = aug[row][col];
            for (let j = col; j <= k1; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }

    const beta = aug.map(row => row[k1]);
    const intercept = beta[0];
    const coefficients = beta.slice(1);

    // R²
    const predicted = X.map(row => intercept + row.reduce((s, v, i) => s + v * coefficients[i], 0));
    const ssRes = y.reduce((sum, yi, i) => sum + (yi - predicted[i]) ** 2, 0);
    const ssTot = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    return { coefficients, intercept, rSquared, predicted };
}

// Sigmoid for logistic regression
function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

// Simple logistic regression via gradient descent
function logisticRegression(
    X: number[][],
    y: number[], // 0 or 1
    iterations = 500,
    lr = 0.01,
): { weights: number[]; intercept: number; accuracy: number } | null {
    const n = X.length;
    if (n < 10) return null;
    const k = X[0].length;

    const weights = new Array(k).fill(0);
    let intercept = 0;

    for (let iter = 0; iter < iterations; iter++) {
        const gradW = new Array(k).fill(0);
        let gradB = 0;

        for (let i = 0; i < n; i++) {
            const z = intercept + X[i].reduce((s, v, j) => s + v * weights[j], 0);
            const p = sigmoid(z);
            const err = p - y[i];
            gradB += err;
            for (let j = 0; j < k; j++) {
                gradW[j] += err * X[i][j];
            }
        }

        intercept -= lr * (gradB / n);
        for (let j = 0; j < k; j++) {
            weights[j] -= lr * (gradW[j] / n);
        }
    }

    // Accuracy
    let correct = 0;
    for (let i = 0; i < n; i++) {
        const z = intercept + X[i].reduce((s, v, j) => s + v * weights[j], 0);
        const pred = sigmoid(z) >= 0.5 ? 1 : 0;
        if (pred === y[i]) correct++;
    }

    return { weights, intercept, accuracy: correct / n };
}

// Smooth new parameters with previous
function smoothParams(newVal: Record<string, number>, prevVal: Record<string, number> | null, factor: number): Record<string, number> {
    if (!prevVal) return newVal;
    const result: Record<string, number> = {};
    for (const key of Object.keys(newVal)) {
        const prev = prevVal[key] ?? newVal[key];
        result[key] = factor * newVal[key] + (1 - factor) * prev;
    }
    return result;
}

// Estimate retention percentiles from average view percentage
function estimateRetentionPercentiles(avgViewPct: number): {
    r25: number; r50: number; r75: number; completion: number;
} {
    // Typical YouTube retention follows exponential decay
    // If avg view % = X, estimate the curve shape
    const avg = Math.min(Math.max(avgViewPct / 100, 0), 1);

    // Model: retention(t) = e^(-λt) where λ = -ln(avg) for unit time
    // At 25%: e^(-0.25λ), at 50%: e^(-0.5λ), etc.
    const lambda = avg > 0 ? -Math.log(avg) : 1;

    return {
        r25: Math.min(Math.exp(-0.25 * lambda), 1),
        r50: Math.min(Math.exp(-0.50 * lambda), 1),
        r75: Math.min(Math.exp(-0.75 * lambda), 1),
        completion: avg, // completion ≈ avg view %
    };
}

// ============================================================================
// Main handler
// ============================================================================
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { mode = 'full' } = await req.json().catch(() => ({}));

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        console.log(`[compute-cognitive-model] Mode: ${mode}`);

        // Rolling window cutoff
        const cutoffDate = new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Load all cognitive features within window
        const { data: allFeatures, error: featError } = await supabase
            .from('video_cognitive_features')
            .select('*')
            .gte('created_at', cutoffDate)
            .not('retention_score', 'is', null);

        if (featError) throw featError;

        const features = allFeatures || [];
        const sampleCount = features.length;
        const activationReady = sampleCount >= MIN_SAMPLES;

        console.log(`[compute-cognitive-model] ${sampleCount} samples (activation: ${activationReady ? 'YES' : `need ${MIN_SAMPLES - sampleCount} more`})`);

        // Get previous model state for smoothing
        const { data: prevModel } = await supabase
            .from('cognitive_model_state')
            .select('*')
            .eq('is_active', true)
            .order('model_week', { ascending: false })
            .limit(1)
            .single();

        const modelWeek = new Date().toISOString().split('T')[0];
        const results: Record<string, any> = { mode, samples: sampleCount, activation_ready: activationReady };

        // -----------------------------------------------------------------------
        // STEP 1: Normalize — compute z-score means & stddevs
        // -----------------------------------------------------------------------
        if (mode === 'normalize' || mode === 'full') {
            console.log('[compute-cognitive-model] Computing normalization parameters...');

            // Also include features without retention for normalization
            const { data: allFeaturesForNorm } = await supabase
                .from('video_cognitive_features')
                .select(FEATURE_KEYS.join(','))
                .gte('created_at', cutoffDate);

            const normFeatures = allFeaturesForNorm || features;
            const featureMeans: Record<string, number> = {};
            const featureStddevs: Record<string, number> = {};

            for (const key of FEATURE_KEYS) {
                const values = normFeatures.map((f: any) => f[key] ?? 0).filter((v: number) => !isNaN(v));
                const m = mean(values);
                featureMeans[key] = parseFloat(m.toFixed(6));
                featureStddevs[key] = parseFloat(stddev(values, m).toFixed(6));
            }

            results.normalization = { means: featureMeans, stddevs: featureStddevs, samples: normFeatures.length };
        }

        // -----------------------------------------------------------------------
        // STEP 2: Retention tiers — classify videos
        // -----------------------------------------------------------------------
        if (mode === 'regress' || mode === 'full') {
            if (features.length > 0) {
                const scores = features.map((f: any) => f.retention_score).filter((s: number) => s != null);
                const highThreshold = percentile(scores, 80);
                const lowThreshold = percentile(scores, 20);

                results.tier_thresholds = { high: highThreshold, low: lowThreshold };

                // Update tiers on all features
                for (const f of features) {
                    if (f.retention_score == null) continue;
                    const tier = f.retention_score >= highThreshold ? 'high'
                        : f.retention_score <= lowThreshold ? 'low'
                            : 'medium';

                    if (f.retention_tier !== tier) {
                        await supabase
                            .from('video_cognitive_features')
                            .update({ retention_tier: tier })
                            .eq('id', f.id);
                    }
                    (f as any)._tier = tier;
                }
            }
        }

        // -----------------------------------------------------------------------
        // STEP 3: Regression — RetentionScore ~ features + interactions
        // -----------------------------------------------------------------------
        let regressionResult: any = null;
        if ((mode === 'regress' || mode === 'full') && sampleCount >= 10) {
            console.log('[compute-cognitive-model] Running multiple linear regression...');

            const featureMeans = results.normalization?.means || prevModel?.feature_means || {};
            const featureStddevs = results.normalization?.stddevs || prevModel?.feature_stddevs || {};

            // Build feature matrix (z-normalized + interaction terms)
            const X: number[][] = [];
            const y: number[] = [];

            for (const f of features) {
                if (f.retention_score == null) continue;

                const row: number[] = FEATURE_KEYS.map(k =>
                    zNormalize(f[k] ?? 0, featureMeans[k] ?? 0, featureStddevs[k] ?? 1)
                );

                // Add interaction terms
                for (const [a, b] of INTERACTION_TERMS) {
                    const aIdx = FEATURE_KEYS.indexOf(a as any);
                    const bIdx = FEATURE_KEYS.indexOf(b as any);
                    row.push(row[aIdx] * row[bIdx]);
                }

                X.push(row);
                y.push(f.retention_score);
            }

            regressionResult = multipleLinearRegression(X, y);

            if (regressionResult) {
                // Map coefficients to feature names
                const coefMap: Record<string, number> = {};
                FEATURE_KEYS.forEach((k, i) => {
                    coefMap[k] = parseFloat(regressionResult.coefficients[i].toFixed(6));
                });

                const interactionCoefMap: Record<string, number> = {};
                INTERACTION_TERMS.forEach(([a, b], i) => {
                    const idx = FEATURE_KEYS.length + i;
                    interactionCoefMap[`${a}×${b}`] = parseFloat(regressionResult.coefficients[idx].toFixed(6));
                });

                // Apply smoothing
                const smoothedCoefs = smoothParams(
                    coefMap,
                    prevModel?.regression_coefficients ?? null,
                    SMOOTHING_FACTOR
                );

                results.regression = {
                    coefficients: smoothedCoefs,
                    interaction_coefficients: interactionCoefMap,
                    intercept: regressionResult.intercept,
                    r_squared: parseFloat(regressionResult.rSquared.toFixed(4)),
                };

                console.log(`[compute-cognitive-model] Regression R²: ${regressionResult.rSquared.toFixed(4)}`);
            }
        }

        // -----------------------------------------------------------------------
        // STEP 4: Optimize — decile bucketing for optimal zones
        // -----------------------------------------------------------------------
        const optimalZones: Record<string, any> = {};
        if ((mode === 'optimize' || mode === 'full') && features.length >= 20) {
            console.log('[compute-cognitive-model] Computing optimal zones via decile analysis...');

            for (const key of FEATURE_KEYS) {
                const pairs = features
                    .filter((f: any) => f[key] != null && f.retention_score != null)
                    .map((f: any) => ({ value: f[key], score: f.retention_score }));

                if (pairs.length < 10) continue;

                // Sort by feature value and split into 10 buckets
                pairs.sort((a: any, b: any) => a.value - b.value);
                const bucketSize = Math.max(1, Math.floor(pairs.length / 10));
                const buckets: { avgValue: number; avgScore: number }[] = [];

                for (let i = 0; i < 10; i++) {
                    const start = i * bucketSize;
                    const end = i === 9 ? pairs.length : (i + 1) * bucketSize;
                    const bucket = pairs.slice(start, end);
                    if (bucket.length === 0) continue;

                    buckets.push({
                        avgValue: mean(bucket.map((b: any) => b.value)),
                        avgScore: mean(bucket.map((b: any) => b.score)),
                    });
                }

                // Find top 2 buckets by avgScore
                const sortedBuckets = [...buckets].sort((a, b) => b.avgScore - a.avgScore);
                const topBuckets = sortedBuckets.slice(0, 2);

                const optMin = Math.min(...topBuckets.map(b => b.avgValue));
                const optMax = Math.max(...topBuckets.map(b => b.avgValue));
                const peakCenter = mean(topBuckets.map(b => b.avgValue));

                optimalZones[key] = {
                    min: parseFloat(optMin.toFixed(4)),
                    max: parseFloat(optMax.toFixed(4)),
                    peak_center: parseFloat(peakCenter.toFixed(4)),
                    peak_score: parseFloat(mean(topBuckets.map(b => b.avgScore)).toFixed(4)),
                };
            }

            results.optimal_zones = optimalZones;
        }

        // -----------------------------------------------------------------------
        // STEP 5: Predict — logistic regression for High Tier
        // -----------------------------------------------------------------------
        let logisticResult: any = null;
        if ((mode === 'predict' || mode === 'full') && sampleCount >= 20) {
            console.log('[compute-cognitive-model] Training logistic regression for tier prediction...');

            const featureMeans = results.normalization?.means || prevModel?.feature_means || {};
            const featureStddevs = results.normalization?.stddevs || prevModel?.feature_stddevs || {};

            const X: number[][] = [];
            const y: number[] = [];

            for (const f of features) {
                if (f.retention_tier == null && (f as any)._tier == null) continue;
                const tier = (f as any)._tier || f.retention_tier;

                const row = FEATURE_KEYS.map(k =>
                    zNormalize(f[k] ?? 0, featureMeans[k] ?? 0, featureStddevs[k] ?? 1)
                );

                // Add interactions
                for (const [a, b] of INTERACTION_TERMS) {
                    const aIdx = FEATURE_KEYS.indexOf(a as any);
                    const bIdx = FEATURE_KEYS.indexOf(b as any);
                    row.push(row[aIdx] * row[bIdx]);
                }

                X.push(row);
                y.push(tier === 'high' ? 1 : 0);
            }

            logisticResult = logisticRegression(X, y);

            if (logisticResult) {
                results.logistic = {
                    accuracy: parseFloat(logisticResult.accuracy.toFixed(4)),
                    weights: logisticResult.weights.map((w: number) => parseFloat(w.toFixed(6))),
                    intercept: parseFloat(logisticResult.intercept.toFixed(6)),
                };
                console.log(`[compute-cognitive-model] Logistic accuracy: ${(logisticResult.accuracy * 100).toFixed(1)}%`);
            }
        }

        // -----------------------------------------------------------------------
        // STEP 6: Score — compute cognitive scores (0-100) for all features
        // -----------------------------------------------------------------------
        if ((mode === 'score' || mode === 'full') && activationReady) {
            console.log('[compute-cognitive-model] Computing cognitive scores...');

            const zones = Object.keys(optimalZones).length > 0
                ? optimalZones
                : prevModel?.optimal_zones || {};

            const featureMeans = results.normalization?.means || prevModel?.feature_means || {};
            const featureStddevs = results.normalization?.stddevs || prevModel?.feature_stddevs || {};
            const domainWeights = prevModel?.domain_weights || {
                visual_complexity: 0.35, motion_intensity: 0.30, linguistic_density: 0.35,
            };

            // Reload ALL features (not just ones with retention)
            const { data: allFeaturesForScoring } = await supabase
                .from('video_cognitive_features')
                .select('*');

            let scored = 0;
            for (const f of allFeaturesForScoring || []) {
                // Per-feature scoring with U-shaped penalty
                const domainScores: Record<string, number[]> = {
                    visual_complexity: [],
                    motion_intensity: [],
                    linguistic_density: [],
                };

                let outOfRangeCount = 0;

                for (const key of FEATURE_KEYS) {
                    const zone = zones[key];
                    if (!zone) continue;

                    const value = f[key] ?? 0;
                    const peak = zone.peak_center;
                    const range = Math.max(zone.max - zone.min, 0.001);
                    const distance = Math.abs(value - peak);
                    const scalingFactor = 10 / range; // Normalize to range width
                    const penalty = distance * scalingFactor;
                    const featureScore = Math.max(0, 10 - penalty); // Max 10 per feature

                    // Check if out of range
                    if (value < zone.min || value > zone.max) outOfRangeCount++;

                    // Assign to domain
                    for (const [domain, keys] of Object.entries(DOMAINS)) {
                        if ((keys as string[]).includes(key)) {
                            domainScores[domain].push(featureScore);
                        }
                    }
                }

                // Domain averages
                const domainAvgs: Record<string, number> = {};
                for (const [domain, scores] of Object.entries(domainScores)) {
                    domainAvgs[domain] = scores.length > 0 ? mean(scores) : 5; // Default mid
                }

                // Weighted domain sum (normalize to 0-100)
                let rawScore = 0;
                for (const [domain, weight] of Object.entries(domainWeights)) {
                    rawScore += (domainAvgs[domain] ?? 5) * (weight as number);
                }
                rawScore = rawScore * 10; // Scale 0-10 → 0-100

                // Interaction overload penalty (quadratic when 3+ out of range)
                if (outOfRangeCount >= 3) {
                    const overloadPenalty = (outOfRangeCount - 2) ** 2 * 3;
                    rawScore = Math.max(0, rawScore - overloadPenalty);
                }

                const cognitiveScore = Math.min(100, Math.max(0, parseFloat(rawScore.toFixed(2))));

                // Predict retention and tier probability
                let predictedRetention: number | null = null;
                let predictedHighProb: number | null = null;

                if (regressionResult || prevModel?.regression_coefficients) {
                    const coefs = regressionResult?.coefficients ||
                        Object.values(prevModel?.regression_coefficients || {});
                    const intercept = regressionResult?.intercept ?? prevModel?.regression_intercept ?? 0;

                    const row = FEATURE_KEYS.map(k =>
                        zNormalize(f[k] ?? 0, featureMeans[k] ?? 0, featureStddevs[k] ?? 1)
                    );
                    for (const [a, b] of INTERACTION_TERMS) {
                        const aIdx = FEATURE_KEYS.indexOf(a as any);
                        const bIdx = FEATURE_KEYS.indexOf(b as any);
                        row.push(row[aIdx] * row[bIdx]);
                    }

                    predictedRetention = parseFloat(
                        (intercept + row.reduce((s, v, i) => s + v * (coefs[i] ?? 0), 0)).toFixed(4)
                    );
                }

                if (logisticResult || prevModel?.logistic_weights) {
                    const lw = logisticResult?.weights || prevModel?.logistic_weights || [];
                    const li = logisticResult?.intercept ?? prevModel?.logistic_intercept ?? 0;

                    const row = FEATURE_KEYS.map(k =>
                        zNormalize(f[k] ?? 0, featureMeans[k] ?? 0, featureStddevs[k] ?? 1)
                    );
                    for (const [a, b] of INTERACTION_TERMS) {
                        const aIdx = FEATURE_KEYS.indexOf(a as any);
                        const bIdx = FEATURE_KEYS.indexOf(b as any);
                        row.push(row[aIdx] * row[bIdx]);
                    }

                    const z = li + row.reduce((s, v, i) => s + v * (lw[i] ?? 0), 0);
                    predictedHighProb = parseFloat(sigmoid(z).toFixed(4));
                }

                // Update
                await supabase
                    .from('video_cognitive_features')
                    .update({
                        cognitive_score: cognitiveScore,
                        predicted_retention_score: predictedRetention,
                        predicted_high_tier_prob: predictedHighProb,
                    })
                    .eq('id', f.id);

                // Also update video_performance if linked
                if (f.video_performance_id) {
                    await supabase
                        .from('video_performance')
                        .update({
                            cognitive_score: cognitiveScore,
                            predicted_retention_score: predictedRetention,
                            predicted_high_tier_prob: predictedHighProb,
                        })
                        .eq('id', f.video_performance_id);
                }

                scored++;
            }

            results.scored = scored;
            console.log(`[compute-cognitive-model] Scored ${scored} videos`);
        }

        // -----------------------------------------------------------------------
        // Save model state
        // -----------------------------------------------------------------------
        if (mode === 'full' || mode === 'regress' || mode === 'optimize') {
            // Deactivate previous model
            await supabase
                .from('cognitive_model_state')
                .update({ is_active: false })
                .eq('is_active', true);

            const modelState = {
                model_week: modelWeek,
                feature_means: results.normalization?.means || prevModel?.feature_means || {},
                feature_stddevs: results.normalization?.stddevs || prevModel?.feature_stddevs || {},
                regression_coefficients: results.regression?.coefficients || prevModel?.regression_coefficients,
                regression_intercept: results.regression?.intercept ?? prevModel?.regression_intercept,
                regression_r_squared: results.regression?.r_squared ?? prevModel?.regression_r_squared,
                interaction_coefficients: results.regression?.interaction_coefficients || prevModel?.interaction_coefficients,
                optimal_zones: Object.keys(optimalZones).length > 0 ? optimalZones : prevModel?.optimal_zones || {},
                logistic_weights: results.logistic?.weights || prevModel?.logistic_weights,
                logistic_intercept: results.logistic?.intercept ?? prevModel?.logistic_intercept,
                logistic_accuracy: results.logistic?.accuracy ?? prevModel?.logistic_accuracy,
                high_tier_threshold: results.tier_thresholds?.high ?? prevModel?.high_tier_threshold,
                low_tier_threshold: results.tier_thresholds?.low ?? prevModel?.low_tier_threshold,
                samples_used: sampleCount,
                rolling_window_days: ROLLING_WINDOW_DAYS,
                smoothing_factor: SMOOTHING_FACTOR,
                is_active: true,
                activation_ready: activationReady,
            };

            const { error: stateError } = await supabase
                .from('cognitive_model_state')
                .upsert(modelState, { onConflict: 'model_week' });

            if (stateError) console.error('[compute-cognitive-model] State save error:', stateError);
        }

        console.log('[compute-cognitive-model] Done.');

        return new Response(JSON.stringify({
            success: true,
            ...results,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[compute-cognitive-model] Error:', error);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
