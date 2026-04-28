import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeltaHistory1777382939774 implements MigrationInterface {
    name = 'AddDeltaHistory1777382939774'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."delta_history_reason_enum" AS ENUM('manual', 'event', 'cascade')`);
        await queryRunner.query(`CREATE TABLE "delta_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "segment_id" character varying NOT NULL, "added_client_ids" text array NOT NULL DEFAULT '{}', "removed_client_ids" text array NOT NULL DEFAULT '{}', "total_members_after" integer NOT NULL, "reason" "public"."delta_history_reason_enum" NOT NULL DEFAULT 'manual', "evaluated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5ab2f5fa8f72133d8e2d779554d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3c24ad2ca625eabbaffe7ab3ce" ON "delta_history" ("segment_id", "evaluated_at") `);
        await queryRunner.query(`ALTER TABLE "delta_history" ADD CONSTRAINT "FK_e3f2495d02f561cbcaad2c70d2a" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delta_history" DROP CONSTRAINT "FK_e3f2495d02f561cbcaad2c70d2a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3c24ad2ca625eabbaffe7ab3ce"`);
        await queryRunner.query(`DROP TABLE "delta_history"`);
        await queryRunner.query(`DROP TYPE "public"."delta_history_reason_enum"`);
    }

}
