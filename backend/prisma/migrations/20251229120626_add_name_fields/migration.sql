-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT 'Admin',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT 'User';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '';
