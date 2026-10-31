import { ApiProperty } from '@nestjs/swagger';

export class CursorPaginationMeta {
  @ApiProperty({ example: 20, description: 'Number of items requested/returned per page' })
  public limit!: number;

  @ApiProperty({
    example: 'eyJpZCI6IjIwIn0',
    nullable: true,
    description: 'Opaque cursor token for the next page, or null if no further records exist',
  })
  public nextCursor!: string | null;

  @ApiProperty({ example: true, description: 'Indicates whether more records exist beyond the current page' })
  public hasMore!: boolean;

  @ApiProperty({ example: 100, required: false, description: 'Total records count if calculated' })
  public total?: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'List of entities in the current page' })
  public data!: T[];

  @ApiProperty({ type: () => CursorPaginationMeta, description: 'Pagination metadata' })
  public meta!: CursorPaginationMeta;
}
