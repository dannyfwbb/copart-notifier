import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class UserPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  chatId: number;

  @Column({ default: '0 * * * *' }) // Default to every hour
  schedule: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, type: 'datetime' })
  lastNotificationTime: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
