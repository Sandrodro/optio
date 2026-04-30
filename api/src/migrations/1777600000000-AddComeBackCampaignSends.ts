import { MigrationInterface, QueryRunner } from "typeorm";

export class AddComeBackCampaignSends1777600000000 implements MigrationInterface {
    name = 'AddComeBackCampaignSends1777600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "come_back_campaign_sends" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "count" integer NOT NULL, "sent_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_come_back_campaign_sends" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "come_back_campaign_sends"`);
    }
}
