import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import * as entities from './entities';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(process.cwd(), 'copart-notifier.sqlite'),
      entities: Object.values(entities),
      synchronize: true, // Set to false in production
    }),
    TypeOrmModule.forFeature(Object.values(entities)),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
