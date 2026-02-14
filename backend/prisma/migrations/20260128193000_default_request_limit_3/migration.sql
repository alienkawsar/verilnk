-- Set default request limit to 3 per day for new users
ALTER TABLE "User" ALTER COLUMN "requestLimit" SET DEFAULT 3;
