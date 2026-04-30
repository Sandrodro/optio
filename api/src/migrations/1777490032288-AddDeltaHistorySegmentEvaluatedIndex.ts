import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeltaHistorySegmentEvaluatedIndex1777490032288 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delta_history_segment_evaluated
      ON delta_history (segment_id, evaluated_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_delta_history_segment_evaluated
    `);
  }
}
