import * as Handlebars from 'handlebars';

/**
 * Register custom Handlebars helpers for email templates
 */
export function registerTemplateHelpers(): void {
  // Helper to format dates
  Handlebars.registerHelper('formatDate', function (date: Date | string) {
    if (!date) {
      return '';
    }
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  // Helper to format security mode for display
  Handlebars.registerHelper('formatSecurityMode', function (mode: string) {
    const modes: Record<string, string> = {
      none: 'None (Unencrypted)',
      tls: 'TLS/SSL',
      starttls: 'STARTTLS',
    };
    return modes[mode] || mode;
  });

  // Helper for conditional equality
  Handlebars.registerHelper('eq', function (a: any, b: any) {
    return a === b;
  });

  // Helper for conditional inequality
  Handlebars.registerHelper('ne', function (a: any, b: any) {
    return a !== b;
  });

  // Helper to uppercase text
  Handlebars.registerHelper('uppercase', function (text: string) {
    return text ? text.toUpperCase() : '';
  });

  // Helper to lowercase text
  Handlebars.registerHelper('lowercase', function (text: string) {
    return text ? text.toLowerCase() : '';
  });
}
