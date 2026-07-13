import bcrypt from 'bcrypt';
import db, { runMigrations } from './index';

runMigrations();

const adminExists = db.prepare('SELECT id FROM admins LIMIT 1').get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created: admin / admin (change in production!)');
}

const settings = [
  ['banner_text', 'БАЗОВАЯ ПОДГОТОВКА ФУТБОЛИСТОВ ОТ 4 ЛЕТ'],
  ['banner_phones', '+375-296-61-19-31, +375-293-40-98-23'],
  ['banner_hours', 'С 11.00 ДО 19.00 ЕЖЕДНЕВНО'],
  ['recruitment_title', 'Сделайте правильный выбор!'],
  ['recruitment_subtitle', '«ФОРТУНА» — ТВОЙ ПЕРВЫЙ УВЕРЕННЫЙ ШАГ В УВЛЕКАТЕЛЬНЫЙ МИР ФУТБОЛА!'],
  ['recruitment_body', `ФК «Фортуна» производит круглогодичный отбор мальчиков 2013–2021 годов рождения для серьёзных занятий футболом.

В клубе занимается 175 юных футболистов. Условия для занятий соответствуют современным требованиям: искусственное поле, хорошие залы, компетентные тренеры, медицинский контроль.

Звоните с 11.00 до 19.00 ежедневно: +375-29-661-19-31 (А1).`],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
for (const [key, value] of settings) {
  insertSetting.run(key, value);
}

const groups = [
  { name: 'ФОРТУНА-1 (2013-2014)', slug: 'fortuna-1-2013-2014', birth_years: '2013-2014', sort_order: 1 },
  { name: 'ФОРТУНА-2 (2015-2016)', slug: 'fortuna-2-2015-2016', birth_years: '2015-2016', sort_order: 2 },
  { name: 'ФОРТУНА-3 (2017-2018)', slug: 'fortuna-3-2017-2018', birth_years: '2017-2018', sort_order: 3 },
  { name: 'ФОРТУНА-4 (2018-2019)', slug: 'fortuna-4-2018-2019', birth_years: '2018-2019', sort_order: 4 },
  { name: 'ФОРТУНА-5 (2020-2021)', slug: 'fortuna-5-2020-2021', birth_years: '2020-2021', sort_order: 5 },
  { name: 'ЧУ-ДО МАСТЕР', slug: 'chu-do-master', birth_years: null, sort_order: 6, is_schedule_only: 1 },
];

const insertGroup = db.prepare(
  'INSERT OR IGNORE INTO groups (name, slug, birth_years, sort_order, is_schedule_only) VALUES (?, ?, ?, ?, ?)'
);
for (const g of groups) {
  insertGroup.run(g.name, g.slug, g.birth_years, g.sort_order, g.is_schedule_only ?? 0);
}
db.prepare(`UPDATE groups SET is_schedule_only = 1 WHERE slug = 'chu-do-master'`).run();

const vizitkaExists = db.prepare('SELECT id FROM vizitka_sections LIMIT 1').get();
if (!vizitkaExists) {
  db.prepare(
    `INSERT INTO vizitka_sections (title, body, sort_order) VALUES (?, ?, ?)`
  ).run(
    'Детско-юношеский футбольный клуб «ФОРТУНА» Минск',
    `Год создания: 2000. Член Ассоциации «Белорусская федерация футбола» и «Федерации футбола г.Минска».

Адрес: Республика Беларусь, г. Минск, ул. Гамарника, 30, офис 361.

Главный тренер-преподаватель, менеджер по работе с талантами — Романовский Сергей Владимирович.
Телефон: +375 29 661-19-31 (А1).

Арена для проведения домашних игр — стадион «Зелёный луг» (г. Минск, ул. Гамарника, 9/1).`,
    1
  );
}

console.log('Seed data applied.');
