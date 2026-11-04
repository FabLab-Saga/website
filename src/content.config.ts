import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { schemas } from './lib/content-model.mjs';

const site = defineCollection({ loader: glob({ pattern: '*.yaml', base: './src/content/site' }), schema: schemas.site });
const pages = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/pages' }), schema: schemas.pages });
const machines = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/machines' }), schema: schemas.machines });
const categories = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/categories' }), schema: schemas.categories });
const courses = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/courses' }), schema: schemas.courses });
const projects = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/projects' }), schema: schemas.projects });
const news = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/news' }), schema: schemas.news });
export const collections = { site, pages, machines, categories, courses, projects, news };
