export interface Article {
  tags: string[];
}

export class BlogConfig {
  /**
   * @minItems 1
   * @maxItems 50
   * @minItems :tags 1
   * @maxItems :tags 20
   * @uniqueItems :tags
   */
  articles!: Article[];
}
