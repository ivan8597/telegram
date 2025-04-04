import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Note {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: string;

    @Column()
    title!: string;

    @Column()
    content!: string;

    @Column()
    category!: string;

    @Column('simple-array')
    tags!: string[];

    @CreateDateColumn()
    created!: Date;

    @UpdateDateColumn()
    lastEdited!: Date;
}



