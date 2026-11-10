1. Copy `src/` over your project's `src/` and `supabase/` + `.env.example` into the project root.
2. npm i @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
3. Run supabase/schema.sql in Supabase > SQL Editor. Turn off "Confirm email" (Auth > Providers > Email) for testing.
4. Copy .env.example to .env.local and fill it in; add the same variables in Vercel > Settings > Environment Variables.
5. R2 bucket > Settings > CORS: allow your Vercel URL + http://localhost:3000, methods GET and PUT, headers *.
