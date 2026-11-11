# Bookshelf Snapshot Stock

Build a book inventory app that helps me turn photos of books into a spreadsheet.

Please build these features:

An input form with an image uploader and a text box for a "SKU" number.

A "Process Book" button. When clicked, use OpenAI Vision to read the uploaded photo and extract the Book Title and Author.

A simple table below the form that saves and displays three columns: Book Title, Author, Book series (if applicable) and SKU.

A "Download CSV" button that lets me export the whole table as a spreadsheet.

Make the design clean, fast, and easy to use on my phone while I am sorting books.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bookshelf-snapshot-stock.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/316c6658-d2a0-4b0d-bd2c-703d883184fb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
