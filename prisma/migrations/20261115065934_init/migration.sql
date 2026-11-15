-- CreateEnum
CREATE TYPE "OwnerKind" AS ENUM ('GUEST', 'USER');

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "kind" "OwnerKind" NOT NULL,
    "clerk_user_id" TEXT,
    "guest_token_hash" TEXT,
    "time_zone" TEXT NOT NULL DEFAULT 'UTC',
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lists" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "emoji" TEXT,
    "position" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "list_id" TEXT,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "due_date" CHAR(10),
    "due_time" CHAR(5),
    "priority" INTEGER NOT NULL DEFAULT 4,
    "position" TEXT NOT NULL,
    "repeat" JSONB,
    "series_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "task_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_clerk_user_id_key" ON "owners"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "owners_guest_token_hash_key" ON "owners"("guest_token_hash");

-- CreateIndex
CREATE INDEX "owners_kind_claimed_at_last_seen_at_idx" ON "owners"("kind", "claimed_at", "last_seen_at");

-- CreateIndex
CREATE INDEX "lists_owner_id_position_idx" ON "lists"("owner_id", "position");

-- CreateIndex
CREATE INDEX "labels_owner_id_idx" ON "labels"("owner_id");

-- CreateIndex
CREATE INDEX "tasks_owner_id_due_date_idx" ON "tasks"("owner_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_owner_id_list_id_position_idx" ON "tasks"("owner_id", "list_id", "position");

-- CreateIndex
CREATE INDEX "tasks_parent_id_idx" ON "tasks"("parent_id");

-- CreateIndex
CREATE INDEX "tasks_series_id_idx" ON "tasks"("series_id");

-- CreateIndex
CREATE INDEX "task_labels_label_id_idx" ON "task_labels"("label_id");

-- AddForeignKey
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
