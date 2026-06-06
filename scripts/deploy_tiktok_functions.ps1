# Deploy newer/updated functions for TikTok integration
Write-Host "Deploying TikTok Integration Functions..."

# OAuth Functions
Call-npx supabase functions deploy tiktok-oauth-start --no-verify-jwt
Call-npx supabase functions deploy tiktok-oauth-callback --no-verify-jwt

# Upload & Queue Functions
Call-npx supabase functions deploy tiktok-upload --no-verify-jwt
Call-npx supabase functions deploy process-tiktok-queue --no-verify-jwt

# Updated Worker API (Trigger)
Call-npx supabase functions deploy worker-api --no-verify-jwt

Write-Host "Deployment Complete! Don't forget to set your secrets using: npx supabase secrets set ..."
