export const BOOK_FORMATS = ["Hardcover with DJ", "Hardcover no DJ", "Paperback small", "Paperback medium", "Paperback large"] as const;
export const isBookFormat = (v: string) => v === "" || (BOOK_FORMATS as readonly string[]).includes(v);
