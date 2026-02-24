declare module 'cryptocompare' {
  export interface NewsArticle {
    id: string;
    guid: string;
    published_on: number;
    imageurl: string;
    title: string;
    url: string;
    source: string;
    body: string;
    tags: string;
    categories: string;
    upvotes: number;
    downvotes: number;
    lang: string;
    source_info: {
      name: string;
      lang: string;
      img: string;
    };
  }

  export function newsList(lang?: string): Promise<NewsArticle[]>;
  export function price(fsym: string, tsyms: string | string[]): Promise<{ [key: string]: number }>;
  export function priceMulti(
    fsyms: string[],
    tsyms: string[]
  ): Promise<{ [key: string]: { [key: string]: number } }>;
  export function priceFull(fsyms: string[], tsyms: string[]): Promise<any>;
  export function priceHistorical(
    fsym: string,
    tsyms: string[],
    options?: { timestamp?: number }
  ): Promise<any>;
}
