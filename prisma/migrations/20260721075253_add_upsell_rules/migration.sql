-- CreateTable
CREATE TABLE "ToolSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "popupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cartBundleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpsellRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "toolType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "triggerType" TEXT NOT NULL,
    "triggerIds" TEXT NOT NULL,
    "discountMode" TEXT NOT NULL DEFAULT 'FREE',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "maxImpressionsPerSession" INTEGER NOT NULL DEFAULT 0,
    "hideIfOfferAlreadyInCart" BOOLEAN NOT NULL DEFAULT true,
    "placement" TEXT NOT NULL DEFAULT 'default',
    "headline" TEXT,
    "subheading" TEXT,
    "buttonText" TEXT,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpsellOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetIds" TEXT NOT NULL,
    "variantOptionMode" TEXT NOT NULL DEFAULT 'INDEPENDENT',
    "fixedVariantId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UpsellOffer_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UpsellEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cartToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UpsellEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolSettings_shop_key" ON "ToolSettings"("shop");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_idx" ON "UpsellRule"("shop");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_enabled_idx" ON "UpsellRule"("shop", "enabled");

-- CreateIndex
CREATE INDEX "UpsellOffer_ruleId_idx" ON "UpsellOffer"("ruleId");

-- CreateIndex
CREATE INDEX "UpsellEvent_ruleId_idx" ON "UpsellEvent"("ruleId");

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_createdAt_idx" ON "UpsellEvent"("shop", "createdAt");
