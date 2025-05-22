import {
    Source,
    Manga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    TagSection,
    TagType,
    RequestManager,
    Request,
    Response,
    MangaTile,
    MangaUpdates,
    LanguageCode,
    MangaStatus,
    HomeSectionType,
    Section
} from '@paperback/types'

import { CombinedSourcesInfo } from './pbconfig'

// Base class for all sources
abstract class BaseSource extends Source {
    abstract readonly baseUrl: string;
    abstract readonly sourceName: string;
    abstract readonly supportsLatest: boolean;
    abstract readonly cloudflareBypass: boolean;
    
    constructor(requestManager: RequestManager) {
        super(requestManager, CombinedSourcesInfo);
    }
    
    abstract getMangaShareUrl(mangaId: string): string;
    abstract getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void>;
    abstract getChapters(mangaId: string): Promise<Chapter[]>;
    abstract getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails>;
    abstract getMangaDetails(mangaId: string): Promise<Manga>;
    abstract getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults>;
    abstract getSearchTags(): Promise<TagSection[]>;
}

// TruyenGG Source Implementation
export class TruyenGG extends BaseSource {
    readonly baseUrl = 'https://truyengg.net';
    readonly sourceName = 'TruyenGG';
    readonly supportsLatest = true;
    readonly cloudflareBypass = true;

    override getMangaShareUrl(mangaId: string): string {
        return `${this.baseUrl}/truyen-tranh/${mangaId}`;
    }

    override async getCloudflareBypassRequest(): Promise<Request> {
        return createRequestObject({
            url: this.baseUrl,
            method: 'GET',
        });
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${this.baseUrl}`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'truyengg-hot',
                    title: 'TruyenGG - Truyện Hot',
                    type: HomeSectionType.featured,
                }),
            },
            {
                request: createRequestObject({
                    url: `${this.baseUrl}`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'truyengg-new',
                    title: 'TruyenGG - Truyện Mới Cập Nhật',
                    type: HomeSectionType.singleRowNormal,
                }),
            },
        ];

        const promises = [];

        for (const section of sections) {
            // Let the app know the section exists
            sectionCallback(section.section);

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 3).then(response => {
                    const $ = this.cheerio.load(response.data);
                    
                    let manga: MangaTile[] = [];
                    
                    if (section.section.id === 'truyengg-hot') {
                        manga = this.parseHotManga($);
                    } else if (section.section.id === 'truyengg-new') {
                        manga = this.parseNewManga($);
                    }
                    
                    section.section.items = manga;
                    sectionCallback(section.section);
                }),
            );
        }

        // Make sure the function completes
        await Promise.all(promises);
    }

    parseHotManga($: CheerioStatic): MangaTile[] {
        const tiles: MangaTile[] = [];
        const containerSelector = '.hot-manga .item';

        for (const container of $(containerSelector).toArray()) {
            const titleElement = $('.manga-title', container);
            const title = titleElement.text().trim();
            
            const idHref = $('a', container).attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', container).attr('src') || $('img', container).attr('data-src') || '';
            
            if (!id || !title) continue;

            tiles.push(createMangaTile({
                id: 'truyengg-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'TruyenGG' }),
            }));
        }

        return tiles;
    }

    parseNewManga($: CheerioStatic): MangaTile[] {
        const tiles: MangaTile[] = [];
        const containerSelector = '.new-manga .item';

        for (const container of $(containerSelector).toArray()) {
            const titleElement = $('.manga-title', container);
            const title = titleElement.text().trim();
            
            const idHref = $('a', container).attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', container).attr('src') || $('img', container).attr('data-src') || '';
            
            if (!id || !title) continue;

            tiles.push(createMangaTile({
                id: 'truyengg-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'TruyenGG' }),
            }));
        }

        return tiles;
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('truyengg-', '');
        const actualChapterId = chapterId.replace('truyengg-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen-tranh/${actualMangaId}/${actualChapterId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const pages: string[] = [];
        
        // Extract image URLs from the chapter
        for (const img of $('.reading-content img').toArray()) {
            const src = $(img).attr('src') || $(img).attr('data-src');
            if (src) {
                pages.push(src);
            }
        }

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false,
        });
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('truyengg-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen-tranh/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const chapters: Chapter[] = [];
        
        // Parse chapters from the manga page
        for (const chapter of $('.list-chapters .chapter-item').toArray()) {
            const titleElement = $('a', chapter);
            const title = titleElement.text().trim();
            
            const idHref = titleElement.attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            if (!id) continue;
            
            // Try to extract chapter number from title
            let chapNum = 1;
            const chapMatch = title.match(/Chapter (\d+(\.\d+)?)/);
            if (chapMatch) {
                chapNum = Number(chapMatch[1]);
            }
            
            // Get date if available
            let date = new Date();
            const dateText = $('.chapter-time', chapter).text().trim();
            if (dateText) {
                // Parse Vietnamese date format if possible
                try {
                    if (dateText.includes('giờ trước')) {
                        const hours = parseInt(dateText);
                        date = new Date(Date.now() - hours * 60 * 60 * 1000);
                    } else if (dateText.includes('ngày trước')) {
                        const days = parseInt(dateText);
                        date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                    }
                } catch (e) {
                    // Use current date if parsing fails
                }
            }

            chapters.push(createChapter({
                id: 'truyengg-' + id,
                mangaId: mangaId,
                chapNum: isNaN(chapNum) ? 0 : chapNum,
                langCode: LanguageCode.VIETNAMESE,
                name: title,
                time: date,
                volume: 0,
            }));
        }

        return chapters;
    }

    override async getMangaDetails(mangaId: string): Promise<Manga> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('truyengg-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen-tranh/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const title = $('.manga-title').text().trim();
        const description = $('.manga-description').text().trim();
        
        // Parse status
        let status = MangaStatus.ONGOING;
        const statusText = $('.manga-status').text().trim().toLowerCase();
        if (statusText.includes('hoàn thành') || statusText.includes('đã hoàn thành')) {
            status = MangaStatus.COMPLETED;
        }
        
        // Parse tags
        const tagSections: TagSection[] = [createTagSection({ id: '0', label: 'thể loại', tags: [] })];
        
        for (const tag of $('.manga-genres .genre').toArray()) {
            const label = $(tag).text().trim();
            const id = $(tag).attr('href')?.split('/').pop() || '';
            
            if (!id || !label) continue;
            
            tagSections[0].tags.push(createTag({ id: id, label: label }));
        }

        // Get cover image
        const coverImage = $('.manga-cover img').attr('src') || $('.manga-cover img').attr('data-src') || '';

        return createManga({
            id: mangaId,
            titles: [title],
            image: coverImage,
            status: status,
            author: $('.manga-author').text().trim() || 'Unknown',
            artist: $('.manga-artist').text().trim() || 'Unknown',
            desc: description,
            tags: tagSections,
            source: this.sourceName,
        });
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        let page = metadata?.page || 1;
        
        const searchUrl = new URL(`${this.baseUrl}/tim-kiem`);
        searchUrl.searchParams.append('q', query.title || '');
        searchUrl.searchParams.append('page', page.toString());
        
        const request = createRequestObject({
            url: searchUrl.toString(),
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const manga: MangaTile[] = [];
        
        for (const item of $('.search-results .manga-item').toArray()) {
            const titleElement = $('.manga-title a', item);
            const title = titleElement.text().trim();
            
            const idHref = titleElement.attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', item).attr('src') || $('img', item).attr('data-src') || '';
            
            if (!id || !title) continue;

            manga.push(createMangaTile({
                id: 'truyengg-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'TruyenGG' }),
            }));
        }
        
        const hasNextPage = $('.pagination .next').length > 0;
        
        return createPagedResults({
            results: manga,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        });
    }

    override async getSearchTags(): Promise<TagSection[]> {
        // Common tags for Vietnamese manga
        const tagSections: TagSection[] = [
            createTagSection({
                id: 'genres',
                label: 'Thể loại',
                tags: [
                    createTag({ id: 'action', label: 'Action' }),
                    createTag({ id: 'adventure', label: 'Adventure' }),
                    createTag({ id: 'comedy', label: 'Comedy' }),
                    createTag({ id: 'drama', label: 'Drama' }),
                    createTag({ id: 'fantasy', label: 'Fantasy' }),
                    createTag({ id: 'horror', label: 'Horror' }),
                    createTag({ id: 'romance', label: 'Romance' }),
                    createTag({ id: 'school-life', label: 'School Life' }),
                    createTag({ id: 'sci-fi', label: 'Sci-Fi' }),
                    createTag({ id: 'slice-of-life', label: 'Slice of Life' }),
                ],
            }),
        ];
        
        return tagSections;
    }
}

// MimiHentai Source Implementation
export class MimiHentai extends BaseSource {
    readonly baseUrl = 'https://mimihentai.com';
    readonly sourceName = 'MimiHentai';
    readonly supportsLatest = true;
    readonly cloudflareBypass = false;

    override getMangaShareUrl(mangaId: string): string {
        return `${this.baseUrl}/truyen/${mangaId}`;
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${this.baseUrl}/home`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'mimihentai-new',
                    title: 'MimiHentai - Truyện Mới',
                    type: HomeSectionType.singleRowNormal,
                }),
            },
            {
                request: createRequestObject({
                    url: `${this.baseUrl}/home`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'mimihentai-top',
                    title: 'MimiHentai - TOP 3',
                    type: HomeSectionType.featured,
                }),
            },
        ];

        const promises = [];

        for (const section of sections) {
            // Let the app know the section exists
            sectionCallback(section.section);

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 3).then(response => {
                    const $ = this.cheerio.load(response.data);
                    
                    let manga: MangaTile[] = [];
                    
                    if (section.section.id === 'mimihentai-new') {
                        manga = this.parseNewManga($);
                    } else if (section.section.id === 'mimihentai-top') {
                        manga = this.parseTopManga($);
                    }
                    
                    section.section.items = manga;
                    sectionCallback(section.section);
                }),
            );
        }

        // Make sure the function completes
        await Promise.all(promises);
    }

    parseNewManga($: CheerioStatic): MangaTile[] {
        const tiles: MangaTile[] = [];
        const containerSelector = '.truyen-moi .card';

        for (const container of $(containerSelector).toArray()) {
            const titleElement = $('.card-title a', container);
            const title = titleElement.text().trim();
            
            const idHref = titleElement.attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', container).attr('src') || '';
            
            if (!id || !title) continue;

            tiles.push(createMangaTile({
                id: 'mimihentai-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'MimiHentai' }),
            }));
        }

        return tiles;
    }

    parseTopManga($: CheerioStatic): MangaTile[] {
        const tiles: MangaTile[] = [];
        const containerSelector = '.top-3 .card';

        for (const container of $(containerSelector).toArray()) {
            const titleElement = $('.card-title', container);
            const title = titleElement.text().trim();
            
            const idHref = $('a', container).attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', container).attr('src') || '';
            
            if (!id || !title) continue;

            tiles.push(createMangaTile({
                id: 'mimihentai-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'MimiHentai' }),
            }));
        }

        return tiles;
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('mimihentai-', '');
        const actualChapterId = chapterId.replace('mimihentai-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen/${actualMangaId}/${actualChapterId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const pages: string[] = [];
        
        // Extract image URLs from the chapter
        for (const img of $('.reading-content img').toArray()) {
            const src = $(img).attr('src') || $(img).attr('data-src');
            if (src) {
                pages.push(src);
            }
        }

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false,
        });
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('mimihentai-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const chapters: Chapter[] = [];
        
        // Parse chapters from the manga page
        for (const chapter of $('.list-chapters .chapter-item').toArray()) {
            const titleElement = $('a', chapter);
            const title = titleElement.text().trim();
            
            const idHref = titleElement.attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            if (!id) continue;
            
            // Try to extract chapter number from title
            let chapNum = 1;
            const chapMatch = title.match(/Chapter (\d+(\.\d+)?)/);
            if (chapMatch) {
                chapNum = Number(chapMatch[1]);
            }
            
            // Get date if available
            let date = new Date();
            const dateText = $('.chapter-time', chapter).text().trim();
            if (dateText) {
                // Parse Vietnamese date format if possible
                try {
                    if (dateText.includes('giờ trước')) {
                        const hours = parseInt(dateText);
                        date = new Date(Date.now() - hours * 60 * 60 * 1000);
                    } else if (dateText.includes('ngày trước')) {
                        const days = parseInt(dateText);
                        date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                    }
                } catch (e) {
                    // Use current date if parsing fails
                }
            }

            chapters.push(createChapter({
                id: 'mimihentai-' + id,
                mangaId: mangaId,
                chapNum: isNaN(chapNum) ? 0 : chapNum,
                langCode: LanguageCode.VIETNAMESE,
                name: title,
                time: date,
                volume: 0,
            }));
        }

        return chapters;
    }

    override async getMangaDetails(mangaId: string): Promise<Manga> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('mimihentai-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/truyen/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const title = $('.manga-title').text().trim();
        const description = $('.manga-description').text().trim();
        
        // Parse tags
        const tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: [] })];
        
        for (const tag of $('.manga-tags .tag').toArray()) {
            const label = $(tag).text().trim();
            const id = $(tag).attr('href')?.split('/').pop() || '';
            
            if (!id || !label) continue;
            
            tagSections[0].tags.push(createTag({ id: id, label: label }));
        }

        // Get cover image
        const coverImage = $('.manga-cover img').attr('src') || '';

        return createManga({
            id: mangaId,
            titles: [title],
            image: coverImage,
            status: MangaStatus.ONGOING,
            author: $('.manga-author').text().trim() || 'Unknown',
            artist: $('.manga-artist').text().trim() || 'Unknown',
            desc: description,
            tags: tagSections,
            source: this.sourceName,
        });
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        let page = metadata?.page || 1;
        
        const searchUrl = new URL(`${this.baseUrl}/tim-kiem`);
        searchUrl.searchParams.append('q', query.title || '');
        searchUrl.searchParams.append('page', page.toString());
        
        const request = createRequestObject({
            url: searchUrl.toString(),
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const manga: MangaTile[] = [];
        
        for (const item of $('.search-results .manga-item').toArray()) {
            const titleElement = $('.manga-title a', item);
            const title = titleElement.text().trim();
            
            const idHref = titleElement.attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('img', item).attr('src') || '';
            
            if (!id || !title) continue;

            manga.push(createMangaTile({
                id: 'mimihentai-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'MimiHentai' }),
            }));
        }
        
        const hasNextPage = $('.pagination .next').length > 0;
        
        return createPagedResults({
            results: manga,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        });
    }

    override async getSearchTags(): Promise<TagSection[]> {
        // Common tags for Vietnamese hentai
        const tagSections: TagSection[] = [
            createTagSection({
                id: 'genres',
                label: 'Thể loại',
                tags: [
                    createTag({ id: 'big-boobs', label: 'Big Boobs' }),
                    createTag({ id: 'ahegao', label: 'Ahegao' }),
                    createTag({ id: 'bondage', label: 'Bondage' }),
                    createTag({ id: 'vanilla', label: 'Vanilla' }),
                    createTag({ id: 'ntr', label: 'NTR' }),
                ],
            }),
        ];
        
        return tagSections;
    }
}

// NHentai Source Implementation
export class NHentai extends BaseSource {
    readonly baseUrl = 'https://nhentai.net';
    readonly sourceName = 'NHentai';
    readonly supportsLatest = true;
    readonly cloudflareBypass = false;

    override getMangaShareUrl(mangaId: string): string {
        return `${this.baseUrl}/g/${mangaId.replace('nhentai-', '')}`;
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${this.baseUrl}`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'nhentai-new',
                    title: 'NHentai - New Uploads',
                    type: HomeSectionType.singleRowNormal,
                }),
            },
            {
                request: createRequestObject({
                    url: `${this.baseUrl}/popular`,
                    method: 'GET',
                }),
                section: createHomeSection({
                    id: 'nhentai-popular',
                    title: 'NHentai - Popular Now',
                    type: HomeSectionType.singleRowNormal,
                }),
            },
        ];

        const promises = [];

        for (const section of sections) {
            // Let the app know the section exists
            sectionCallback(section.section);

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 3).then(response => {
                    const $ = this.cheerio.load(response.data);
                    const manga = this.parseMangaTiles($);
                    section.section.items = manga;
                    sectionCallback(section.section);
                }),
            );
        }

        // Make sure the function completes
        await Promise.all(promises);
    }

    parseMangaTiles($: CheerioStatic): MangaTile[] {
        const tiles: MangaTile[] = [];
        const containerSelector = '.gallery';

        for (const container of $(containerSelector).toArray()) {
            const titleElement = $('a div.caption', container);
            const title = titleElement.text().trim();
            
            const idHref = $('a', container).attr('href');
            const id = idHref ? idHref.split('/').pop() || '' : '';
            
            const image = $('a img', container).attr('data-src') || $('a img', container).attr('src') || '';
            
            if (!id || !title) continue;

            tiles.push(createMangaTile({
                id: 'nhentai-' + id,
                title: createIconText({ text: title }),
                image: image,
                subtitleText: createIconText({ text: 'NHentai' }),
            }));
        }

        return tiles;
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('nhentai-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/g/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const pages: string[] = [];
        const thumbContainer = $('#thumbnail-container');
        
        for (const thumb of $('a', thumbContainer).toArray()) {
            const pageUrl = $(thumb).attr('href');
            if (pageUrl) {
                const pageId = pageUrl.split('/').pop()?.split('.')[0];
                if (pageId) {
                    const fullImageUrl = `https://i.nhentai.net/galleries/${actualMangaId}/${pageId}.jpg`;
                    pages.push(fullImageUrl);
                }
            }
        }

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false,
        });
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        // For nhentai, there's only one chapter per manga
        return [
            createChapter({
                id: mangaId, // Use the same ID as manga
                mangaId: mangaId,
                chapNum: 1,
                langCode: LanguageCode.ENGLISH,
                name: 'Chapter',
                time: new Date(),
                volume: 0,
            }),
        ];
    }

    override async getMangaDetails(mangaId: string): Promise<Manga> {
        // Remove source prefix if present
        const actualMangaId = mangaId.replace('nhentai-', '');
        
        const request = createRequestObject({
            url: `${this.baseUrl}/g/${actualMangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const title = $('#info h1').text().trim();
        const description = $('#info h2').text().trim();
        
        // Parse tags
        const tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: [] })];
        
        for (const tag of $('#tags .tag-container:contains("Tags:") .tag').toArray()) {
            const label = $('.name', tag).text().trim();
            const id = $(tag).attr('href')?.split('/').pop() || '';
            
            if (!id || !label) continue;
            
            tagSections[0].tags.push(createTag({ id: id, label: label }));
        }

        // Get cover image
        const coverImage = $('#cover img').attr('data-src') || $('#cover img').attr('src') || '';

        return createManga({
            id: mangaId,
            titles: [title],
            image: coverImage,
            status: MangaStatus.COMPLETED,
            author: 'Unknown',
            artist: 'Unknown',
            desc: description,
            tags: tagSections,
            source: this.sourceName,
        });
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        let page = metadata?.page || 1;
        
        const searchUrl = new URL(`${this.baseUrl}/search/`);
        searchUrl.searchParams.append('q', query.title || '');
        searchUrl.searchParams.append('page', page.toString());
        
        const request = createRequestObject({
            url: searchUrl.toString(),
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3);
        const $ = this.cheerio.load(response.data);
        
        const manga = this.parseMangaTiles($);
        const hasNextPage = $('.pagination .next').length > 0;
        
        return createPagedResults({
            results: manga,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        });
    }

    override async getSearchTags(): Promise<TagSection[]> {
        // This would require scraping the tags from the site
        // For simplicity, returning a basic set of common tags
        const tagSections: TagSection[] = [
            createTagSection({
                id: 'genres',
                label: 'Genres',
                tags: [
                    createTag({ id: 'english', label: 'English' }),
                    createTag({ id: 'japanese', label: 'Japanese' }),
                    createTag({ id: 'chinese', label: 'Chinese' }),
                ],
            }),
        ];
        
        return tagSections;
    }
}

// Main source class that combines all sources
export class CombinedSources extends Source {
    private readonly truyenGG: TruyenGG;
    private readonly mimiHentai: MimiHentai;
    private readonly nHentai: NHentai;
    
    constructor(requestManager: RequestManager) {
        super(requestManager, CombinedSourcesInfo);
        this.truyenGG = new TruyenGG(requestManager);
        this.mimiHentai = new MimiHentai(requestManager);
        this.nHentai = new NHentai(requestManager);
    }
    
    override getMangaShareUrl(mangaId: string): string {
        if (mangaId.startsWith('truyengg-')) {
            return this.truyenGG.getMangaShareUrl(mangaId.replace('truyengg-', ''));
        } else if (mangaId.startsWith('mimihentai-')) {
            return this.mimiHentai.getMangaShareUrl(mangaId.replace('mimihentai-', ''));
        } else if (mangaId.startsWith('nhentai-')) {
            return this.nHentai.getMangaShareUrl(mangaId.replace('nhentai-', ''));
        }
        return '';
    }
    
    override async getCloudflareBypassRequest(): Promise<Request> {
        return this.truyenGG.getCloudflareBypassRequest();
    }
    
    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        await Promise.all([
            this.truyenGG.getHomePageSections(sectionCallback),
            this.mimiHentai.getHomePageSections(sectionCallback),
            this.nHentai.getHomePageSections(sectionCallback)
        ]);
    }
    
    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        if (mangaId.startsWith('truyengg-')) {
            return this.truyenGG.getChapterDetails(mangaId, chapterId);
        } else if (mangaId.startsWith('mimihentai-')) {
            return this.mimiHentai.getChapterDetails(mangaId, chapterId);
        } else if (mangaId.startsWith('nhentai-')) {
            return this.nHentai.getChapterDetails(mangaId, chapterId);
        }
        throw new Error('Unknown source for manga ID: ' + mangaId);
    }
    
    override async getChapters(mangaId: string): Promise<Chapter[]> {
        if (mangaId.startsWith('truyengg-')) {
            return this.truyenGG.getChapters(mangaId);
        } else if (mangaId.startsWith('mimihentai-')) {
            return this.mimiHentai.getChapters(mangaId);
        } else if (mangaId.startsWith('nhentai-')) {
            return this.nHentai.getChapters(mangaId);
        }
        return [];
    }
    
    override async getMangaDetails(mangaId: string): Promise<Manga> {
        if (mangaId.startsWith('truyengg-')) {
            return this.truyenGG.getMangaDetails(mangaId);
        } else if (mangaId.startsWith('mimihentai-')) {
            return this.mimiHentai.getMangaDetails(mangaId);
        } else if (mangaId.startsWith('nhentai-')) {
            return this.nHentai.getMangaDetails(mangaId);
        }
        throw new Error('Unknown source for manga ID: ' + mangaId);
    }
    
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        // If source is specified in the included tags, only search that source
        const sourceTag = query.includedTags?.find(tag => 
            tag.id === 'truyengg' || tag.id === 'mimihentai' || tag.id === 'nhentai'
        );
        
        if (sourceTag) {
            if (sourceTag.id === 'truyengg') {
                return this.truyenGG.getSearchResults(query, metadata);
            } else if (sourceTag.id === 'mimihentai') {
                return this.mimiHentai.getSearchResults(query, metadata);
            } else if (sourceTag.id === 'nhentai') {
                return this.nHentai.getSearchResults(query, metadata);
            }
        }
        
        // If no source specified, search all sources and combine results
        const [truyenResults, mimiResults, nhentaiResults] = await Promise.all([
            this.truyenGG.getSearchResults(query, metadata),
            this.mimiHentai.getSearchResults(query, metadata),
            this.nHentai.getSearchResults(query, metadata)
        ]);
        
        // Combine results from all sources
        const combinedResults = [
            ...truyenResults.results,
            ...mimiResults.results,
            ...nhentaiResults.results
        ];
        
        // Determine if any source has more pages
        const hasMorePages = truyenResults.metadata || mimiResults.metadata || nhentaiResults.metadata;
        
        return createPagedResults({
            results: combinedResults,
            metadata: hasMorePages ? { page: (metadata?.page || 1) + 1 } : undefined
        });
    }
    
    override async getSearchTags(): Promise<TagSection[]> {
        // Create a source selection tag section
        const sourceTags = createTagSection({
            id: 'sources',
            label: 'Sources',
            tags: [
                createTag({ id: 'truyengg', label: 'TruyenGG' }),
                createTag({ id: 'mimihentai', label: 'MimiHentai' }),
                createTag({ id: 'nhentai', label: 'NHentai' })
            ]
        });
        
        // Get tags from each source
        const [truyenTags, mimiTags, nhentaiTags] = await Promise.all([
            this.truyenGG.getSearchTags(),
            this.mimiHentai.getSearchTags(),
            this.nHentai.getSearchTags()
        ]);
        
        // Combine all tags
        return [
            sourceTags,
            ...truyenTags,
            ...mimiTags,
            ...nhentaiTags
        ];
    }
}

// Helper functions
function createRequestObject(requestObject: any): Request {
    return requestObject as Request;
}

function createHomeSection(homeSectionObject: any): HomeSection {
    return homeSectionObject as HomeSection;
}

function createMangaTile(mangaTileObject: any): MangaTile {
    return mangaTileObject as MangaTile;
}

function createIconText(iconTextObject: any): any {
    return iconTextObject;
}

function createChapterDetails(chapterDetailsObject: any): ChapterDetails {
    return chapterDetailsObject as ChapterDetails;
}

function createChapter(chapterObject: any): Chapter {
    return chapterObject as Chapter;
}

function createManga(mangaObject: any): Manga {
    return mangaObject as Manga;
}

function createTag(tagObject: any): any {
    return tagObject;
}

function createTagSection(tagSectionObject: any): TagSection {
    return tagSectionObject as TagSection;
}

function createPagedResults(pagedResultsObject: any): PagedResults {
    return pagedResultsObject as PagedResults;
}
