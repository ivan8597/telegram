// bot.ts
import 'reflect-metadata';
import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import * as dotenv from 'dotenv';
import { DataSource, Repository, Like } from 'typeorm';
import { Note } from './entities/Note';
import { Reminder } from './entities/Reminder';
import { Media } from './entities/Media';
import * as fs from 'fs/promises';

dotenv.config();

interface BotConfig {
  token: string;
}

class TelegramBot {
  private bot: Telegraf;
  private config: BotConfig;
  private noteRepository: Repository<Note> | null = null;
  private reminderRepository: Repository<Reminder> | null = null;
  private mediaRepository: Repository<Media> | null = null;

  constructor(config: BotConfig) {
    this.config = config;
    this.bot = new Telegraf(this.config.token);
    this.initializeDatabase();
    this.setupCommands();
    this.setupHandlers();
    this.setupActionHandlers();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const AppDataSource = new DataSource({
        type: 'sqlite',
        database: 'bot.sqlite',
        entities: [Note, Reminder, Media],
        synchronize: true
      });

      await AppDataSource.initialize();
      
      this.noteRepository = AppDataSource.getRepository(Note);
      this.reminderRepository = AppDataSource.getRepository(Reminder);
      this.mediaRepository = AppDataSource.getRepository(Media);

      console.log('База данных успешно инициализирована');
    } catch (error) {
      console.error('Ошибка инициализации базы данных:', error);
    }
  }

  private setupCommands(): void {
    this.bot.start((ctx) => {
      const keyboard = Markup.keyboard([
        ['📝 Новая заметка', '📋 Мои заметки'],
        ['🔍 Поиск заметок', '✏️ Редактировать заметку'],
        ['⏰ Напоминание', '📅 Мои напоминания'],
        ['📸 Мои медиафайлы', '📊 Статистика'],
        ['📤 Экспорт', '🗑 Очистить'],
        ['❓ Помощь']
      ]).resize();

      ctx.reply('Привет! Я ваш личный ассистент. Выберите действие:', keyboard);
    });

    this.bot.help((ctx) => {
      ctx.reply(
        'Список доступных команд:\n' +
        '/start - Начать работу\n' +
        '/note [заголовок] [текст] [категория] - Создать заметку\n' +
        '/notes - Показать все заметки\n' +
        '/search [запрос] - Поиск по заметкам\n' +
        '/editnote [id] [заголовок] [текст] [категория] - Редактировать заметку\n' +
        '/remind [минуты] [текст] [повтор] - Установить напоминание\n' +
        '/editreminder [id] [минуты] [текст] [повтор] - Редактировать напоминание\n' +
        '/reminders - Показать активные напоминания\n' +
        '/media - Показать медиафайлы\n' +
        '/stats - Показать статистику\n' +
        '/export - Экспортировать данные\n' +
        '/clear - Очистить все данные\n' +
        '/delete [тип] [id] - Удалить запись'
      );
    });

    this.bot.command('note', async (ctx) => {
      const [_, title, ...rest] = ctx.message.text.split(' ');
      const category = rest[rest.length - 1].startsWith('#') ? rest.pop() : undefined;
      const content = rest.join(' ');
      if (!title || !content) {
        return ctx.reply('Использование: /note [заголовок] [текст] [#категория/подкатегория]');
      }
      await this.createNote(ctx, title, content, category?.substring(1));
    });

    this.bot.command('editnote', async (ctx) => {
      const [_, id, title, ...rest] = ctx.message.text.split(' ');
      const category = rest[rest.length - 1].startsWith('#') ? rest.pop() : undefined;
      const content = rest.join(' ');
      if (!id || !title || !content) {
        return ctx.reply('Использование: /editnote [id] [заголовок] [текст] [#категория]');
      }
      await this.editNote(ctx, parseInt(id), title, content, category?.substring(1));
    });

    this.bot.command('notes', async (ctx) => await this.showNotes(ctx));
    this.bot.command('search', async (ctx) => {
      const [_, ...query] = ctx.message.text.split(' ');
      if (!query.length) return ctx.reply('Использование: /search [запрос]');
      await this.searchNotes(ctx, query.join(' '));
    });

    this.bot.command('remind', async (ctx) => {
      const [_, minutes, ...rest] = ctx.message.text.split(' ');
      const repeat = ['ежедневно', 'еженедельно'].includes(rest[rest.length - 1]) ? rest.pop() : undefined;
      const text = rest.join(' ');
      if (!minutes || !text) {
        return ctx.reply('Использование: /remind [минуты] [текст] [повтор:ежедневно/еженедельно]');
      }
      await this.setReminder(ctx, parseInt(minutes), text, repeat as 'ежедневно' | 'еженедельно');
    });

    this.bot.command('editreminder', async (ctx) => {
      const [_, id, minutes, ...rest] = ctx.message.text.split(' ');
      const repeat = ['ежедневно', 'еженедельно'].includes(rest[rest.length - 1]) ? rest.pop() : undefined;
      const text = rest.join(' ');
      if (!id || !minutes || !text) {
        return ctx.reply('Использование: /editreminder [id] [минуты] [текст] [повтор]');
      }
      await this.editReminder(ctx, parseInt(id), parseInt(minutes), text, repeat as 'ежедневно' | 'еженедельно');
    });

    this.bot.command('reminders', async (ctx) => await this.showReminders(ctx));
    this.bot.command('media', async (ctx) => await this.showMedia(ctx));
    this.bot.command('stats', async (ctx) => await this.showStats(ctx));
    this.bot.command('export', async (ctx) => await this.exportData(ctx));
    this.bot.command('clear', async (ctx) => await this.clearUserData(ctx));
    this.bot.command('delete', async (ctx) => {
      const [_, type, id] = ctx.message.text.split(' ');
      if (!type || !id) return ctx.reply('Использование: /delete [тип:note/reminder/media] [id]');
      await this.deleteItem(ctx, type, parseInt(id));
    });
  }

  private setupHandlers(): void {
    this.bot.on(message('text'), async (ctx) => {
      const messageText = ctx.message.text.toLowerCase();
      
      switch (true) {
        case messageText.includes('новая заметка'):
          ctx.reply('Введите заметку в формате: [заголовок] [текст] [#категория/подкатегория]');
          break;
        case messageText.includes('мои заметки'):
          await this.showNotes(ctx);
          break;
        case messageText.includes('редактировать заметку'):
          ctx.reply('Введите: /editnote [id] [заголовок] [текст] [#категория]');
          break;
        case messageText.includes('поиск заметок'):
          ctx.reply('Введите запрос для поиска:');
          break;
        case messageText.includes('напоминание'):
          ctx.reply('Введите время (в минутах), текст и опционально повтор:');
          break;
        case messageText.includes('мои напоминания'):
          await this.showReminders(ctx);
          break;
        case messageText.includes('мои медиафайлы'):
          await this.showMedia(ctx);
          break;
        case messageText.includes('статистика'):
          await this.showStats(ctx);
          break;
        case messageText.includes('экспорт'):
          await this.exportData(ctx);
          break;
        case messageText.includes('очистить'):
          await this.clearUserData(ctx);
          break;
        default:
          if (messageText.includes('привет')) {
            ctx.reply('Здравствуйте! Чем могу помочь?');
          } else if (messageText.includes('как дела')) {
            ctx.reply('Отлично, спасибо! А у вас?');
          } else {
            ctx.reply('Я вас понял. Напишите /help для списка команд');
          }
      }
    });

    this.bot.on(message('photo'), async (ctx) => {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await this.saveMedia(ctx, photo.file_id, 'photo', ctx.message.caption);
      ctx.reply('📸 Фото сохранено!', Markup.inlineKeyboard([
        Markup.button.callback('Скачать', `download_media_${photo.file_id}`)
      ]));
    });

    this.bot.on(message('video'), async (ctx) => {
      await this.saveMedia(ctx, ctx.message.video.file_id, 'video', ctx.message.caption);
      ctx.reply('🎥 Видео сохранено!', Markup.inlineKeyboard([
        Markup.button.callback('Скачать', `download_media_${ctx.message.video.file_id}`)
      ]));
    });

    this.bot.on(message('document'), async (ctx) => {
      await this.saveMedia(ctx, ctx.message.document.file_id, 'document', ctx.message.caption, 
        ctx.message.document.file_name, ctx.message.document.mime_type);
      ctx.reply('📄 Документ сохранен!', Markup.inlineKeyboard([
        Markup.button.callback('Скачать', `download_media_${ctx.message.document.file_id}`)
      ]));
    });

    this.bot.on(message('voice'), async (ctx) => {
      await this.saveMedia(ctx, ctx.message.voice.file_id, 'voice');
      ctx.reply('🎤 Голосовое сообщение сохранено!', Markup.inlineKeyboard([
        Markup.button.callback('Скачать', `download_media_${ctx.message.voice.file_id}`)
      ]));
    });
  }

  private setupActionHandlers(): void {
    this.bot.action(/download_media_(.+)/, async (ctx) => {
      const fileId = ctx.match[1];
      try {
        const fileLink = await this.bot.telegram.getFileLink(fileId);
        await ctx.replyWithDocument({ url: fileLink.toString(), filename: `media_${fileId}` });
      } catch (error) {
        console.error('Ошибка скачивания медиа:', error);
        ctx.reply('Произошла ошибка при скачивании файла');
      }
    });
  }

  private async createNote(ctx: any, title: string, content: string, category?: string): Promise<void> {
    try {
      if (!this.noteRepository) throw new Error('База данных не инициализирована');
      const note = this.noteRepository.create({
        userId: ctx.from.id,
        title,
        content,
        category: category || '',
        created: new Date(),
        lastEdited: new Date()
      });

      await this.noteRepository.save(note);
      ctx.reply(
        `📝 Заметка создана:\n` +
        `ID: ${note.id}\n` +
        `Заголовок: ${note.title}\n` +
        `Текст: ${note.content}\n` +
        `${category ? `Категория: ${category}\n` : ''}` +
        `Создана: ${note.created.toLocaleString()}`
      );
    } catch (error) {
      console.error('Ошибка создания заметки:', error);
      ctx.reply('Произошла ошибка при создании заметки');
    }
  }

  private async editNote(ctx: any, id: number, title: string, content: string, category?: string): Promise<void> {
    try {
      if (!this.noteRepository) throw new Error('База данных не инициализирована');
      const note = await this.noteRepository.findOne({ where: { id, userId: ctx.from.id } });
      if (!note) {
        ctx.reply('Заметка не найдена');
        return;
      }

      note.title = title;
      note.content = content;
      note.category = category || '';
      note.lastEdited = new Date();

      await this.noteRepository.save(note);
      ctx.reply(
        `✏️ Заметка отредактирована:\n` +
        `ID: ${note.id}\n` +
        `Заголовок: ${note.title}\n` +
        `Текст: ${note.content}\n` +
        `${category ? `Категория: ${category}\n` : ''}` +
        `Последнее редактирование: ${note.lastEdited.toLocaleString()}`
      );
    } catch (error) {
      console.error('Ошибка редактирования заметки:', error);
      ctx.reply('Произошла ошибка при редактировании заметки');
    }
  }

  private async showNotes(ctx: any): Promise<void> {
    try {
      if (!this.noteRepository) throw new Error('База данных не инициализирована');
      const notes = await this.noteRepository.find({
        where: { userId: ctx.from.id },
        order: { created: 'DESC' }
      });

      if (notes.length === 0) {
        ctx.reply('У вас пока нет заметок');
        return;
      }

      const notesText = notes
        .map((note) => 
          `ID: ${note.id}\n` +
          `${note.title}\n` +
          `   ${note.content}\n` +
          `${note.category ? `   Категория: ${note.category}\n` : ''}` +
          `   Создана: ${note.created.toLocaleString()}` +
          `${note.lastEdited && note.lastEdited > note.created ? 
            `\n   Редактирована: ${note.lastEdited.toLocaleString()}` : ''}`
        )
        .join('\n\n');

      ctx.reply(`📋 Ваши заметки:\n\n${notesText}\n\nДля редактирования: /editnote [ID]`);
    } catch (error) {
      console.error('Ошибка получения заметок:', error);
      ctx.reply('Произошла ошибка при получении заметок');
    }
  }

  private async searchNotes(ctx: any, query: string): Promise<void> {
    try {
      if (!this.noteRepository) throw new Error('База данных не инициализирована');
      const notes = await this.noteRepository.find({
        where: [
          { userId: ctx.from.id, title: Like(`%${query}%`) },
          { userId: ctx.from.id, content: Like(`%${query}%`) },
          { userId: ctx.from.id, category: Like(`%${query}%`) }
        ],
        order: { created: 'DESC' }
      });

      if (notes.length === 0) {
        ctx.reply('Заметки по вашему запросу не найдены');
        return;
      }

      const notesText = notes
        .map((note) => 
          `ID: ${note.id}\n` +
          `${note.title}\n` +
          `   ${note.content}\n` +
          `${note.category ? `   Категория: ${note.category}\n` : ''}` +
          `   Создана: ${note.created.toLocaleString()}`
        )
        .join('\n\n');

      ctx.reply(`🔍 Результаты поиска "${query}":\n\n${notesText}`);
    } catch (error) {
      console.error('Ошибка поиска заметок:', error);
      ctx.reply('Произошла ошибка при поиске заметок');
    }
  }

  private async setReminder(ctx: any, minutes: number, text: string, repeat?: 'ежедневно' | 'еженедельно'): Promise<void> {
    try {
      if (!this.reminderRepository) throw new Error('База данных не инициализирована');
      if (minutes <= 0 || minutes > 1440) {
        ctx.reply('Пожалуйста, укажите время от 1 до 1440 минут (24 часа)');
        return;
      }

      const reminder = this.reminderRepository.create({
        userId: ctx.from.id,
        text,
        time: new Date(Date.now() + minutes * 60000),
        completed: false,
        repeat,
        created: new Date()
      });

      await this.reminderRepository.save(reminder);
      ctx.reply(
        `✅ Напоминание установлено:\n` +
        `ID: ${reminder.id}\n` +
        `Время: ${reminder.time.toLocaleTimeString()}` +
        `${repeat ? `\nПовтор: ${repeat}` : ''}`
      );

      this.scheduleReminder(ctx, reminder);
    } catch (error) {
      console.error('Ошибка создания напоминания:', error);
      ctx.reply('Произошла ошибка при создании напоминания');
    }
  }

  private async editReminder(ctx: any, id: number, minutes: number, text: string, repeat?: 'ежедневно' | 'еженедельно'): Promise<void> {
    try {
      if (!this.reminderRepository) throw new Error('База данных не инициализирована');
      const reminder = await this.reminderRepository.findOne({ where: { id, userId: ctx.from.id } });
      if (!reminder) {
        ctx.reply('Напоминание не найдено');
        return;
      }

      reminder.text = text;
      reminder.time = new Date(Date.now() + minutes * 60000);
      reminder.repeat = repeat || 'ежедневно';
      reminder.completed = false;

      await this.reminderRepository.save(reminder);
      ctx.reply(
        `✏️ Напоминание отредактировано:\n` +
        `ID: ${reminder.id}\n` +
        `Текст: ${reminder.text}\n` +
        `Время: ${reminder.time.toLocaleString()}` +
        `${repeat ? `\nПовтор: ${repeat}` : ''}`
      );

      this.scheduleReminder(ctx, reminder);
    } catch (error) {
      console.error('Ошибка редактирования напоминания:', error);
      ctx.reply('Произошла ошибка при редактировании напоминания');
    }
  }

  private async scheduleReminder(ctx: any, reminder: Reminder): Promise<void> {
    const timeUntil = reminder.time.getTime() - Date.now();
    
    // Предупреждение за 5 минут
    if (timeUntil > 300000) { // 5 минут в миллисекундах
      setTimeout(async () => {
        await ctx.telegram.sendMessage(ctx.from.id, 
          `⏰ Через 5 минут: ${reminder.text}`);
      }, timeUntil - 300000);
    }

    setTimeout(async () => {
      await ctx.telegram.sendMessage(ctx.from.id, `⏰ Напоминание: ${reminder.text}`);
      if (!this.reminderRepository) return;

      if (reminder.repeat) {
        const newTime = new Date(reminder.time);
        newTime.setDate(newTime.getDate() + (reminder.repeat === 'ежедневно' ? 1 : 7));
        reminder.time = newTime;
        await this.reminderRepository.save(reminder);
        this.scheduleReminder(ctx, reminder);
      } else {
        reminder.completed = true;
        await this.reminderRepository.save(reminder);
      }
    }, timeUntil);
  }

  private async showReminders(ctx: any): Promise<void> {
    try {
      if (!this.reminderRepository) throw new Error('База данных не инициализирована');
      const reminders = await this.reminderRepository.find({
        where: { userId: ctx.from.id, completed: false },
        order: { time: 'ASC' }
      });

      if (reminders.length === 0) {
        ctx.reply('У вас нет активных напоминаний');
        return;
      }

      const remindersText = reminders
        .map((reminder) => 
          `ID: ${reminder.id}\n` +
          `${reminder.text}\n` +
          `   Время: ${reminder.time.toLocaleString()}` +
          `${reminder.repeat ? `\n   Повтор: ${reminder.repeat}` : ''}`
        )
        .join('\n\n');

      ctx.reply(`⏰ Ваши активные напоминания:\n\n${remindersText}\n\nДля редактирования: /editreminder [ID]`);
    } catch (error) {
      console.error('Ошибка получения напоминаний:', error);
      ctx.reply('Произошла ошибка при получении напоминаний');
    }
  }

  private async saveMedia(ctx: any, fileId: string, type: string, caption?: string, fileName?: string, mimeType?: string): Promise<void> {
    try {
      if (!this.mediaRepository) throw new Error('База данных не инициализирована');
      const media = this.mediaRepository.create({
        userId: ctx.from.id,
        fileId,
        type,
        caption,
        fileName,
        mimeType,
        uploaded: new Date()
      });

      await this.mediaRepository.save(media);
    } catch (error) {
      console.error('Ошибка сохранения медиафайла:', error);
      ctx.reply('Произошла ошибка при сохранении медиафайла');
    }
  }

  private async showMedia(ctx: any): Promise<void> {
    try {
      if (!this.mediaRepository) throw new Error('База данных не инициализирована');
      const media = await this.mediaRepository.find({
        where: { userId: ctx.from.id },
        order: { uploaded: 'DESC' }
      });

      if (media.length === 0) {
        ctx.reply('У вас нет сохраненных медиафайлов');
        return;
      }

      const mediaText = media
        .map((item) => 
          `ID: ${item.id}\n` +
          `Тип: ${item.type}\n` +
          `   ${item.caption ? `Подпись: ${item.caption}\n` : ''}` +
          `   ${item.fileName ? `Файл: ${item.fileName}\n` : ''}` +
          `   Загружено: ${item.uploaded.toLocaleString()}`
        )
        .join('\n\n');

      ctx.reply(`📁 Ваши медиафайлы:\n\n${mediaText}`);
    } catch (error) {
      console.error('Ошибка получения медиафайлов:', error);
      ctx.reply('Произошла ошибка при получении медиафайлов');
    }
  }

  private async showStats(ctx: any): Promise<void> {
    try {
      if (!this.noteRepository || !this.reminderRepository || !this.mediaRepository) {
        throw new Error('База данных не инициализирована');
      }

      const [notesCount, remindersCount, mediaCount] = await Promise.all([
        this.noteRepository.count({ where: { userId: ctx.from.id } }),
        this.reminderRepository.count({ where: { userId: ctx.from.id } }),
        this.mediaRepository.count({ where: { userId: ctx.from.id } })
      ]);

      const categories = await this.noteRepository
        .createQueryBuilder('note')
        .select('note.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('note.userId = :userId', { userId: ctx.from.id })
        .andWhere('note.category IS NOT NULL')
        .groupBy('note.category')
        .getRawMany();

      const statsText = 
        `📊 Статистика использования:\n\n` +
        `Заметок: ${notesCount}\n` +
        `Напоминаний: ${remindersCount}\n` +
        `Медиафайлов: ${mediaCount}\n\n` +
        `Категории заметок:\n` +
        categories.map(c => `   ${c.category}: ${c.count}`).join('\n');

      ctx.reply(statsText);
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      ctx.reply('Произошла ошибка при получении статистики');
    }
  }

  private async exportData(ctx: any): Promise<void> {
    try {
      if (!this.noteRepository || !this.reminderRepository || !this.mediaRepository) {
        throw new Error('База данных не инициализирована');
      }

      const [notes, reminders, media] = await Promise.all([
        this.noteRepository.find({ where: { userId: ctx.from.id } }),
        this.reminderRepository.find({ where: { userId: ctx.from.id } }),
        this.mediaRepository.find({ where: { userId: ctx.from.id } })
      ]);

      const exportData = {
        notes,
        reminders,
        media,
        exportedAt: new Date()
      };

      const fileName = `export_${ctx.from.id}_${Date.now()}.json`;
      await fs.writeFile(fileName, JSON.stringify(exportData, null, 2));
      
      await ctx.replyWithDocument({
        source: fileName,
        filename: 'export.json'
      });

      await fs.unlink(fileName);
      ctx.reply('📤 Ваши данные успешно экспортированы');
    } catch (error) {
      console.error('Ошибка экспорта данных:', error);
      ctx.reply('Произошла ошибка при экспорте данных');
    }
  }

  private async deleteItem(ctx: any, type: string, id: number): Promise<void> {
    try {
      if (!this.noteRepository || !this.reminderRepository || !this.mediaRepository) {
        throw new Error('База данных не инициализирована');
      }
      const userId = ctx.from.id;

      switch (type.toLowerCase()) {
        case 'note':
          await this.noteRepository.delete({ id, userId });
          ctx.reply('✅ Заметка удалена');
          break;
        case 'reminder':
          await this.reminderRepository.delete({ id, userId });
          ctx.reply('✅ Напоминание удалено');
          break;
        case 'media':
          await this.mediaRepository.delete({ id, userId });
          ctx.reply('✅ Медиафайл удален');
          break;
        default:
          ctx.reply('Неверный тип. Используйте: note, reminder или media');
      }
    } catch (error) {
      console.error('Ошибка удаления:', error);
      ctx.reply('Произошла ошибка при удалении');
    }
  }

  private async clearUserData(ctx: any): Promise<void> {
    try {
      if (!this.noteRepository || !this.reminderRepository || !this.mediaRepository) {
        throw new Error('База данных не инициализирована');
      }
      const userId = ctx.from.id;

      await Promise.all([
        this.noteRepository.delete({ userId }),
        this.reminderRepository.delete({ userId }),
        this.mediaRepository.delete({ userId })
      ]);

      ctx.reply('🗑 Все ваши данные успешно удалены');
    } catch (error) {
      console.error('Ошибка очистки данных:', error);
      ctx.reply('Произошла ошибка при очистке данных');
    }
  }

  public async launch(): Promise<void> {
    try {
      await this.bot.launch();
      console.log('Бот успешно запущен');
      
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      console.error('Ошибка запуска бота:', error);
    }
  }
}

const botConfig: BotConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || ''
};

if (!botConfig.token) {
  throw new Error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
}

const bot = new TelegramBot(botConfig);
bot.launch();