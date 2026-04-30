import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1777377933571 implements MigrationInterface {
    name = 'Initial1777377933571'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "country" character varying(2) NOT NULL, "signup_date" date NOT NULL, "last_transaction_at" TIMESTAMP, "total_transaction_count" integer NOT NULL DEFAULT '0', "total_purchases_60d" numeric(12,2) NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "client_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "occured_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7dae6630ce8b1b191d6acc47b9" ON "transactions" ("client_id", "occured_at") `);
        await queryRunner.query(`CREATE TYPE "public"."segments_type_enum" AS ENUM('dynamic', 'static')`);
        await queryRunner.query(`CREATE TABLE "segments" ("id" character varying NOT NULL, "name" character varying NOT NULL, "type" "public"."segments_type_enum" NOT NULL, "rules" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_beff1eec19679fe8ad4f291f04e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_ebb352c973d8a85e8779a15ff35" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_ebb352c973d8a85e8779a15ff35"`);
        await queryRunner.query(`DROP TABLE "segments"`);
        await queryRunner.query(`DROP TYPE "public"."segments_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dae6630ce8b1b191d6acc47b9"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TABLE "clients"`);
    }

}
