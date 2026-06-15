import { IsNumber, IsOptional, IsString, Matches, Min, Max, MinLength } from 'class-validator';

export class CreateStockDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '股票代码必须是 6 位数字' })
  code: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStockDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  market?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  changeAmount?: number;

  @IsOptional()
  @IsNumber()
  changePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}


/**
 * 买入三件套(状态:watching → holding)
 * - entryPrice: 买入价(必填,> 0)
 * - lossRate: 最大可承受亏损率,百分比 0-100(必填,如 15 表示 15%)
 * - buyReason: 买入理由(必填,≥ 10 字)
 */
export class BuyStockDto {
  @IsNumber()
  @Min(0.01)
  entryPrice!: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  lossRate!: number;

  @IsString()
  @MinLength(10)
  buyReason!: string;
}

/**
 * 卖出(状态:holding → watching)
 * - exitReason: 卖出理由(可选,会存进新 note)
 */
export class SellStockDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  exitReason?: string;
}
