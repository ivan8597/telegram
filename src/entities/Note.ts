import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Note {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: number;

    @Column()
    title!: string;

    @Column()
    content!: string;

    @Column({ nullable: true })
    category!: string;

    @CreateDateColumn()
    created!: Date;

    @UpdateDateColumn()
    lastEdited!: Date;
}



