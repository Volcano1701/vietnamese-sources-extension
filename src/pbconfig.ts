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
    ContentRating,
    SourceIntents,
    HomeSectionType,
    MangaStatus,
    LanguageCode,
    Request
} from '@paperback/types'

export const CombinedSourcesInfo: SourceInfo = {
    version: '0.0.1',
    name: 'Combined Vietnamese Sources',
    icon: 'icon.png',
    author: 'Manus',
    authorWebsite: 'https://github.com/manus-team',
    description: 'Extension that combines TruyenGG, MimiHentai, and NHentai sources',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: '',
    sourceTags: [
        {
            text: "Vietnamese",
            type: "info"
        },
        {
            text: "Adult Content",
            type: "danger"
        }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
};
