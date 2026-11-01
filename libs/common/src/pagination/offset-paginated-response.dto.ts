import { ApiProperty } from '@nestjs/swagger';

export class OffsetPaginationMeta {
  @ApiProperty({ description: 'Total records matching query', example: 100 })
  public total!: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  public page!: number;

  @ApiProperty({ description: 'Page size limit', example: 20 })
  public limit!: number;

  @ApiProperty({ description: 'Total pages calculated', example: 5 })
  public totalPages!: number;

  @ApiProperty({ description: 'Whether next page exists', example: true })
  public hasNext!: boolean;

  @ApiProperty({ description: 'Whether previous page exists', example: false })
  public hasPrev!: boolean;
}

export class OffsetPaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  public data!: T[];

  @ApiProperty({ type: OffsetPaginationMeta })
  public meta!: OffsetPaginationMeta;
}
