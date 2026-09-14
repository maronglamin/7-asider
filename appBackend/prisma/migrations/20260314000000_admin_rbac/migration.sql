-- CreateEnum
CREATE TYPE "AdminUserType" AS ENUM ('OWNER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminUser" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "adminUserType" "AdminUserType";
ALTER TABLE "User" ADD COLUMN "adminUserStatus" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "adminTotpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "adminTotpEnabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "admin_user_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_group_members" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_group_members_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_moduleKey_actionKey_key" ON "admin_permissions"("moduleKey", "actionKey");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_groups_name_key" ON "admin_user_groups"("name");

-- CreateIndex
CREATE INDEX "User_adminUser_adminUserType_idx" ON "User"("adminUser", "adminUserType");

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_groups" ADD CONSTRAINT "admin_user_groups_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_group_members" ADD CONSTRAINT "admin_user_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_group_members" ADD CONSTRAINT "admin_user_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "admin_user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing super admins as OWNER portal admins
UPDATE "User"
SET
  "adminUser" = true,
  "adminUserType" = 'OWNER',
  "adminUserStatus" = 'ACTIVE'
WHERE "supadmin" = true;
