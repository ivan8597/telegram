import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Media {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: number;

    @Column()
    fileId!: string;

    @Column()
    type!: string;

    @Column({ nullable: true })
    caption!: string;

    @CreateDateColumn()
    uploaded!: Date;

    @Column({ nullable: true })
    fileName!: string;

    @Column({ nullable: true })
    mimeType!: string;
} 