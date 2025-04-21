import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class CarListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  model: string;

  @Column()
  year: number;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column()
  auctionDate: Date;

  @Column({ unique: true })
  listingId: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  lotUrl: string;

  @Column({ nullable: true })
  damageDescription: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  driveType: string;

  @Column({ nullable: true })
  transmissionType: string;

  @Column({ nullable: true })
  fuelType: string;

  @Column({ nullable: true })
  odometer: number;

  @Column({ nullable: true })
  odometerType: string;

  @Column({ nullable: true })
  engine: string;

  @Column({ nullable: true })
  cylinders: string;

  // Additional fields for detailed car information
  @Column({ nullable: true })
  vin: string;

  @Column({ nullable: true })
  make: string;

  @Column({ nullable: true })
  titleState: string;

  @Column({ nullable: true })
  titleType: string;

  @Column({ nullable: true })
  titleDescription: string;

  @Column({ nullable: true })
  lotDescription: string;

  @Column({ nullable: true })
  yardName: string;

  @Column({ nullable: true })
  lotCondition: string;

  @Column({ nullable: true })
  saleStatus: string;

  @Column({ nullable: true })
  bidStatus: string;

  @CreateDateColumn()
  createdAt: Date;
}
