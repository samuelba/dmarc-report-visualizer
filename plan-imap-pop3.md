Plan: Add IMAP/POP3 DMARC Report Downloaders
Add IMAP and POP3 email protocol support to complement existing Gmail downloader and file watcher, enabling users to fetch DMARC reports from any email provider using standard protocols.

Steps
Create EmailMessageTracking entity in backend/src/dmarc/entities/ with fields messageId, accountIdentifier, source (imap/pop3/gmail), status, attemptCount, processedAt and composite unique index on (messageId, source) for deduplication, plus migration file to create the table.

Create EmailMessageTrackingService in backend/src/dmarc/services/ with methods isProcessed(), markProcessing(), markSuccess(), markFailed() to handle database tracking and prevent reprocessing messages.

Install npm packages - add imapflow (^1.0.164), mailparser (^3.7.1), and poplib (^0.1.7) to package.json dependencies.

Create ImapDownloaderService in backend/src/dmarc/services/ implementing OnModuleInit/OnModuleDestroy, using ImapFlow for connection, simpleParser for email parsing, polling with setInterval, and reusing getSafeFilename(), detectFileTypeByName(), inline processing, and failure handling patterns from GmailDownloaderService.

Create Pop3DownloaderService in backend/src/dmarc/services/ using poplib client with similar polling architecture, tracking messages by Message-ID header (since POP3 lacks UIDs), optional delete-after-download (default false), and same attachment processing pipeline.

Add configuration variables to .env for both protocols: ENABLE_[IMAP|POP3]_DOWNLOADER, [IMAP|POP3]_HOST/PORT/USER/PASSWORD/TLS, IMAP_MAILBOX, IMAP_PROCESSED_FOLDER, IMAP_SEARCH_CRITERIA, [IMAP|POP3]_POLL_INTERVAL_MS/PROCESS_INLINE/SAVE_ORIGINAL/FAILURE_THRESHOLD, and POP3_DELETE_AFTER_DOWNLOAD.

Register services in DmarcModule by adding ImapDownloaderService, Pop3DownloaderService, and EmailMessageTrackingService to providers array in backend/src/dmarc/dmarc.module.ts, and add EmailMessageTracking to TypeORM entities.

Further Considerations
IMAP folder creation: Should the IMAP service automatically create the IMAP_PROCESSED_FOLDER if it doesn't exist (recommended: yes, with fallback to mark-as-read)?

POP3 delete behavior: The POP3_DELETE_AFTER_DOWNLOAD option is destructive - recommend default to false and document clearly in comments/README?

