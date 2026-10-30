import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ACTIVE_STATUSES } from '../appointment.constants';

@Injectable()
export class AppointmentAvailabilityRepository {
  private readonly activeStatuses = [...ACTIVE_STATUSES];

  public async hasVehicleOverlap(
    m: EntityManager,
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<boolean> {
    const rows = await m.query<{ one: number }[]>(
      `SELECT 1 AS one FROM appointments
       WHERE vehicle_id = $1
         AND status = ANY($4::text[])
         AND period && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       LIMIT 1`,
      [vehicleId, from.toISOString(), to.toISOString(), this.activeStatuses],
    );
    return rows.length > 0;
  }

  public async findFreeBayId(
    m: EntityManager,
    dealershipId: string,
    from: Date,
    to: Date,
  ): Promise<string | null> {
    const rows = await m.query<{ id: string }[]>(
      `SELECT b.id FROM service_bays b
       WHERE b.dealership_id = $1 AND b.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.service_bay_id = b.id
             AND a.status = ANY($4::text[])
             AND a.period && tstzrange($2::timestamptz, $3::timestamptz, '[)')
         )
       ORDER BY b.id ASC
       LIMIT 1`,
      [dealershipId, from.toISOString(), to.toISOString(), this.activeStatuses],
    );
    return rows[0]?.id ?? null;
  }

  public async findFreeTechnicianId(
    m: EntityManager,
    p: {
      dealershipId: string;
      skillId: string | null;
      requestedId?: string;
      from: Date;
      to: Date;
    },
  ): Promise<string | null> {
    const rows = await m.query<{ id: string }[]>(
      `SELECT t.id FROM technicians t
       WHERE t.dealership_id = $1 AND t.is_active = TRUE
         AND ($2::bigint IS NULL OR t.id = $2::bigint)
         AND ($3::bigint IS NULL OR EXISTS (
               SELECT 1 FROM technician_skills ts
               WHERE ts.technician_id = t.id AND ts.skill_id = $3::bigint
             ))
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.technician_id = t.id
             AND a.status = ANY($6::text[])
             AND a.period && tstzrange($4::timestamptz, $5::timestamptz, '[)')
         )
       ORDER BY t.id ASC
       LIMIT 1`,
      [
        p.dealershipId,
        p.requestedId ? Number(p.requestedId) : null,
        p.skillId ? Number(p.skillId) : null,
        p.from.toISOString(),
        p.to.toISOString(),
        this.activeStatuses,
      ],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Batch counts free bays and qualified technicians for all candidate slots in a SINGLE SQL query (G3).
   * Eliminates the N+1 query performance bottleneck.
   */
  public async countFreePerSlot(
    m: EntityManager | DataSource,
    p: {
      dealershipId: string;
      skillId: string | null;
      slots: ReadonlyArray<{ startAt: Date; occupiedUntil: Date }>;
    },
  ): Promise<Map<number, { freeBays: number; freeTechnicians: number }>> {
    if (p.slots.length === 0) {
      return new Map();
    }

    const rows = await m.query<{ start_at: Date; free_bays: number; free_techs: number }[]>(
      `WITH s AS (
         SELECT * FROM unnest($2::timestamptz[], $3::timestamptz[]) AS t(start_at, occupied_until)
       )
       SELECT s.start_at,
         (SELECT COUNT(*)::int FROM service_bays b
           WHERE b.dealership_id = $1 AND b.is_active = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM appointments a
               WHERE a.service_bay_id = b.id
                 AND a.status = ANY($4::text[])
                 AND a.period && tstzrange(s.start_at, s.occupied_until, '[)'))
         ) AS free_bays,
         (SELECT COUNT(*)::int FROM technicians t
           WHERE t.dealership_id = $1 AND t.is_active = TRUE
             AND ($5::bigint IS NULL OR EXISTS (
                   SELECT 1 FROM technician_skills ts
                   WHERE ts.technician_id = t.id AND ts.skill_id = $5::bigint))
             AND NOT EXISTS (
               SELECT 1 FROM appointments a
               WHERE a.technician_id = t.id
                 AND a.status = ANY($4::text[])
                 AND a.period && tstzrange(s.start_at, s.occupied_until, '[)'))
         ) AS free_techs
       FROM s
       ORDER BY s.start_at`,
      [
        p.dealershipId,
        p.slots.map((x) => x.startAt.toISOString()),
        p.slots.map((x) => x.occupiedUntil.toISOString()),
        this.activeStatuses,
        p.skillId ? Number(p.skillId) : null,
      ],
    );

    return new Map(
      rows.map((r) => [
        new Date(r.start_at).getTime(),
        { freeBays: r.free_bays, freeTechnicians: r.free_techs },
      ]),
    );
  }

  /**
   * Batch queries free qualified technicians for all candidate slots in a SINGLE SQL query.
   * Enables customer technician selection on the booking interface without causing N+1 query storms.
   *
   * @param m Transactional EntityManager or DataSource
   * @param p Query parameters containing dealershipId, optional skillId, and slots array
   * @returns Map indexed by slot epoch timestamp containing array of available technicians
   */
  public async findFreeTechniciansPerSlot(
    m: EntityManager | DataSource,
    p: {
      dealershipId: string;
      skillId: string | null;
      slots: ReadonlyArray<{ startAt: Date; occupiedUntil: Date }>;
    },
  ): Promise<Map<number, Array<{ id: string; name: string; skillIds: string[] }>>> {
    if (p.slots.length === 0) {
      return new Map();
    }

    const rows = await m.query<{
      start_at: Date;
      technician_id: string;
      technician_name: string;
      skill_ids: string[];
    }[]>(
      `WITH s AS (
         SELECT * FROM unnest($2::timestamptz[], $3::timestamptz[]) AS t(start_at, occupied_until)
       )
       SELECT
         s.start_at,
         t.id::text AS technician_id,
         t.name AS technician_name,
         COALESCE(ARRAY_AGG(ts.skill_id::text) FILTER (WHERE ts.skill_id IS NOT NULL), '{}') AS skill_ids
       FROM s
       CROSS JOIN technicians t
       LEFT JOIN technician_skills ts ON ts.technician_id = t.id
       WHERE t.dealership_id = $1 AND t.is_active = TRUE
         AND ($4::bigint IS NULL OR EXISTS (
               SELECT 1 FROM technician_skills ts2
               WHERE ts2.technician_id = t.id AND ts2.skill_id = $4::bigint
             ))
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.technician_id = t.id
             AND a.status = ANY($5::text[])
             AND a.period && tstzrange(s.start_at, s.occupied_until, '[)')
         )
       GROUP BY s.start_at, t.id, t.name
       ORDER BY s.start_at, t.id ASC`,
      [
        p.dealershipId,
        p.slots.map((x) => x.startAt.toISOString()),
        p.slots.map((x) => x.occupiedUntil.toISOString()),
        p.skillId ? Number(p.skillId) : null,
        this.activeStatuses,
      ],
    );

    const resultMap = new Map<number, Array<{ id: string; name: string; skillIds: string[] }>>();
    for (const row of rows) {
      const key = new Date(row.start_at).getTime();
      const existing = resultMap.get(key) ?? [];
      existing.push({
        id: row.technician_id,
        name: row.technician_name,
        skillIds: row.skill_ids ?? [],
      });
      resultMap.set(key, existing);
    }

    return resultMap;
  }

  /**
   * Queries free qualified technicians for a specific single time interval [from, to).
   * Used when a customer or staff queries technician availability for a chosen slot (SYSTEM_DESIGN.md §9.2).
   */
  public async findFreeTechniciansForWindow(
    m: EntityManager | DataSource,
    p: {
      dealershipId: string;
      skillId?: string | null;
      from: Date;
      to: Date;
    },
  ): Promise<Array<{ id: string; name: string; skillIds: string[] }>> {
    const rows = await m.query<{
      technician_id: string;
      technician_name: string;
      skill_ids: string[];
    }[]>(
      `SELECT
         t.id::text AS technician_id,
         t.name AS technician_name,
         COALESCE(ARRAY_AGG(ts.skill_id::text) FILTER (WHERE ts.skill_id IS NOT NULL), '{}') AS skill_ids
       FROM technicians t
       LEFT JOIN technician_skills ts ON ts.technician_id = t.id
       WHERE t.dealership_id = $1 AND t.is_active = TRUE
         AND ($2::bigint IS NULL OR EXISTS (
               SELECT 1 FROM technician_skills ts2
               WHERE ts2.technician_id = t.id AND ts2.skill_id = $2::bigint
             ))
         AND NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.technician_id = t.id
             AND a.status = ANY($5::text[])
             AND a.period && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         )
       GROUP BY t.id, t.name
       ORDER BY t.id ASC`,
      [
        p.dealershipId,
        p.skillId ? Number(p.skillId) : null,
        p.from.toISOString(),
        p.to.toISOString(),
        this.activeStatuses,
      ],
    );

    return rows.map((r) => ({
      id: r.technician_id,
      name: r.technician_name,
      skillIds: r.skill_ids ?? [],
    }));
  }
}
