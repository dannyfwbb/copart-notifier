import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarListing } from '../database/entities';
import { CopartService } from './copart.service';

/**
 * Module for handling Copart API integration and car listing data
 */
@Module({
  imports: [TypeOrmModule.forFeature([CarListing])],
  providers: [CopartService],
  exports: [CopartService],
})
export class CopartModule {}
