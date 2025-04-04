// entities/Reminder.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Reminder {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: number;

    @Column()
    text!: string;

    @Column()
    time!: Date;

    @Column({ default: false })
    completed!: boolean;

    @Column({ nullable: true })
    repeat!: 'ежедневно' | 'еженедельно';

    @CreateDateColumn()
    created!: Date;
}