import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserPreference } from './user-preference.entity';
import { CarListing } from './car-listing.entity';

@Entity()
export class AuctionReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  chatId: number;

  @Column()
  listingId: string;

  @Column()
  reminderTime: Date;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => UserPreference)
  @JoinColumn({ name: 'chatId', referencedColumnName: 'chatId' })
  user: UserPreference;

  @ManyToOne(() => CarListing)
  @JoinColumn({ name: 'listingId', referencedColumnName: 'listingId' })
  listing: CarListing;
}
