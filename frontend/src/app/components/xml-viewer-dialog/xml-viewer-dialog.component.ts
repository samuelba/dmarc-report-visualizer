import { Component, Inject, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';

import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-highlight/prism-line-highlight';
import { DmarcRecord } from '../../services/api.service';

export interface XmlViewerDialogData {
  xml: string;
  record?: DmarcRecord;
  reportId?: string;
  title?: string;
}

@Component({
  selector: 'app-xml-viewer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="xml-viewer-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>
          <mat-icon>code</mat-icon>
          {{ data.title || 'XML Report Viewer' }}
        </h2>
        <div class="header-actions">
          <button
            *ngIf="highlightedLines"
            mat-icon-button
            (click)="scrollToHighlight()"
            matTooltip="Jump to highlighted record"
          >
            <mat-icon>my_location</mat-icon>
          </button>
          <button
            mat-icon-button
            (click)="copyToClipboard()"
            matTooltip="Copy XML to clipboard"
          >
            <mat-icon>content_copy</mat-icon>
          </button>
          <button
            mat-icon-button
            (click)="downloadXml()"
            matTooltip="Download XML file"
          >
            <mat-icon>download</mat-icon>
          </button>
          <button
            mat-icon-button
            (click)="copyShareLink()"
            matTooltip="Copy shareable link"
          >
            <mat-icon>share</mat-icon>
          </button>
          <button mat-icon-button mat-dialog-close matTooltip="Close">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>
      <mat-dialog-content>
        <div class="xml-container">
          <pre
            #xmlContent
            class="line-numbers"
            [attr.data-line]="highlightedLines"
            [attr.data-line-offset]="lineOffset"
          ><code class="language-markup">{{ highlightedXml }}</code></pre>
        </div>
      </mat-dialog-content>
    </div>
  `,
  styles: [
    `
      .xml-viewer-dialog {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 85vh;
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid #e0e0e0;
      }

      h2[mat-dialog-title] {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 20px;
        font-weight: 500;
      }

      .header-actions {
        display: flex;
        gap: 4px;
      }

      mat-dialog-content {
        flex: 1;
        overflow: auto;
        padding: 0 !important;
        margin: 0 !important;
        max-height: none !important;
      }

      .xml-container {
        padding: 16px;
        background-color: #f5f5f5;
        min-height: 100%;
      }

      pre {
        margin: 0;
        padding: 0;
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow-x: auto;
        font-family: 'Courier New', Consolas, Monaco, monospace;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre;
        word-wrap: normal;
      }

      code {
        display: block;
        padding: 0;
      }

      /* Line numbers styling */
      :host ::ng-deep .line-numbers-rows {
        border-right: 1px solid #e0e0e0;
      }

      /* Line highlight styling */
      :host ::ng-deep .line-highlight {
        background: linear-gradient(to right, rgba(255, 193, 7, 0.2) 70%, rgba(255, 193, 7, 0));
        margin-top: 0;
      }

      :host ::ng-deep .line-highlight:before,
      :host ::ng-deep .line-highlight[data-end]:after {
        background-color: #ffc107;
        color: #fff;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
      }

      /* Smooth scroll */
      .xml-container {
        scroll-behavior: smooth;
      }
    `,
  ],
})
export class XmlViewerDialogComponent implements OnInit, AfterViewInit {
  @ViewChild('xmlContent') xmlContent!: ElementRef;

  highlightedXml: string = '';
  highlightedLines: string | null = null;
  lineOffset = 0;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: XmlViewerDialogData,
    private dialogRef: MatDialogRef<XmlViewerDialogComponent>,
    private snackBar: MatSnackBar,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.processXml();
  }

  ngAfterViewInit() {
    // Wait for DOM to be ready, then highlight with Prism
    setTimeout(() => {
      if (this.xmlContent?.nativeElement) {
        const pre = this.xmlContent.nativeElement;
        
        // PrismJS will automatically apply plugins if:
        // 1. The pre element has the class "line-numbers"
        // 2. The data-line attribute is set before highlighting
        // 3. We call Prism.highlightAllUnder() on the container
        
        Prism.highlightAllUnder(pre.parentElement);
      }
      
      // Scroll to highlighted lines after highlighting is complete
      if (this.highlightedLines) {
        setTimeout(() => this.scrollToHighlight(), 500);
      }
    }, 50);
  }

  private processXml() {
    // Trim any leading/trailing whitespace to ensure line numbers are accurate
    let processedXml = this.data.xml.trim();
    
    // If XML is all on one line, format it properly
    if (processedXml.split('\n').length < 10) {
      processedXml = this.formatXml(processedXml);
    }
    
    // Find and highlight the specific record if provided
    if (this.data.record) {
      this.highlightedLines = this.findRecordLines(processedXml, this.data.record);
    }

    // Store the formatted XML content
    this.highlightedXml = processedXml;
  }

  private formatXml(xml: string): string {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');
      
      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        return xml; // Return original if parsing fails
      }

      return this.serializeXml(xmlDoc.documentElement, 0);
    } catch (e) {
      return xml; // Return original on error
    }
  }

  private serializeXml(node: Node, indent: number): string {
    const indentStr = '  '.repeat(indent);
    
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || '';
      return text ? text : '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName;
      const attributes = Array.from(element.attributes)
        .map(attr => ` ${attr.name}="${attr.value}"`)
        .join('');

      const children = Array.from(element.childNodes);
      
      // If only text content, keep it inline
      if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
        const text = children[0].textContent?.trim() || '';
        return `${indentStr}<${tagName}${attributes}>${text}</${tagName}>\n`;
      }

      // For empty elements
      if (children.length === 0) {
        return `${indentStr}<${tagName}${attributes}/>\n`;
      }

      // For elements with children
      let result = `${indentStr}<${tagName}${attributes}>\n`;
      children.forEach(child => {
        result += this.serializeXml(child, indent + 1);
      });
      result += `${indentStr}</${tagName}>\n`;
      return result;
    }

    return '';
  }

  private findRecordLines(xml: string, record: DmarcRecord): string | null {
    const lines = xml.split('\n');
    
    // Look for <record> tags
    const recordStarts: number[] = [];
    const recordEnds: number[] = [];
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed === '<record>' || trimmed.startsWith('<record>')) {
        recordStarts.push(index + 1); // Line numbers are 1-based
      } else if (trimmed === '</record>' || trimmed.startsWith('</record>')) {
        recordEnds.push(index + 1);
      }
    });

    // Now find the matching record by checking the content between each <record></record> pair
    for (let i = 0; i < recordStarts.length && i < recordEnds.length; i++) {
      const startLine = recordStarts[i];
      const endLine = recordEnds[i];
      const recordContent = lines.slice(startLine - 1, endLine).join('\n');
      
      if (this.isMatchingRecord(recordContent, record)) {
        return `${startLine}-${endLine}`;
      }
    }

    return null;
  }

  private isMatchingRecord(recordXml: string, record: DmarcRecord): boolean {
    let matchCount = 0;
    let checkCount = 0;

    // Match based on source_ip (required)
    if (record.sourceIp) {
      checkCount++;
      const ipMatch = recordXml.includes(`<source_ip>${record.sourceIp}</source_ip>`);
      if (!ipMatch) return false;
      matchCount++;
    }

    // Match based on count (required)
    if (record.count !== undefined && record.count !== null) {
      checkCount++;
      const countMatch = recordXml.includes(`<count>${record.count}</count>`);
      if (!countMatch) return false;
      matchCount++;
    }

    // Match based on disposition (in policy_evaluated section)
    if (record.disposition) {
      checkCount++;
      const dispositionMatch = recordXml.includes(`<disposition>${record.disposition}</disposition>`);
      if (dispositionMatch) matchCount++;
    }

    // Match based on DKIM policy evaluated (in policy_evaluated section)
    if (record.dmarcDkim) {
      checkCount++;
      const dkimMatch = recordXml.includes(`<dkim>${record.dmarcDkim}</dkim>`);
      if (dkimMatch) matchCount++;
    }

    // Match based on SPF policy evaluated (in policy_evaluated section)
    if (record.dmarcSpf) {
      checkCount++;
      const spfMatch = recordXml.includes(`<spf>${record.dmarcSpf}</spf>`);
      if (spfMatch) matchCount++;
    }

    // Match based on header_from (identifiers section)
    if (record.headerFrom) {
      checkCount++;
      const headerFromMatch = recordXml.includes(`<header_from>${record.headerFrom}</header_from>`);
      if (headerFromMatch) matchCount++;
    }

    // Match based on envelope_to (identifiers section)
    if (record.envelopeTo) {
      checkCount++;
      const envelopeToMatch = recordXml.includes(`<envelope_to>${record.envelopeTo}</envelope_to>`);
      if (envelopeToMatch) matchCount++;
    }

    // Match based on envelope_from (identifiers section)
    if (record.envelopeFrom) {
      checkCount++;
      const envelopeFromMatch = recordXml.includes(`<envelope_from>${record.envelopeFrom}</envelope_from>`);
      if (envelopeFromMatch) matchCount++;
    }

    // We need at least source_ip and count to match, plus at least 2 more fields
    const requiredMatches = Math.min(4, checkCount);
    const isMatch = matchCount >= requiredMatches;
    
    return isMatch;
  }

  scrollToHighlight() {
    if (!this.highlightedLines) return;

    const container = this.xmlContent?.nativeElement?.closest('mat-dialog-content');
    if (!container) return;

    // Find the highlighted line element
    const highlightedElement = document.querySelector('.line-highlight');
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Fallback: calculate position
      const lineNumber = parseInt(this.highlightedLines.split('-')[0], 10);
      const lineHeight = 24; // approximate line height
      const scrollPosition = Math.max(0, (lineNumber - 5) * lineHeight);
      container.scrollTop = scrollPosition;
    }
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.data.xml).then(
      () => {
        this.snackBar.open('XML copied to clipboard', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      },
      (err) => {
        this.snackBar.open('Failed to copy XML', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    );
  }

  downloadXml() {
    const blob = new Blob([this.data.xml], { type: 'application/xml' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Create filename based on reportId or timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = this.data.reportId 
      ? `dmarc-report-${this.data.reportId}.xml`
      : `dmarc-report-${timestamp}.xml`;
    
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
    
    this.snackBar.open('XML file downloaded', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  copyShareLink() {
    // Build the current page URL without hash
    const baseUrl = window.location.origin + window.location.pathname;
    
    // Get current query params
    const currentParams = new URLSearchParams(window.location.search);
    
    // Determine which ID to include based on what data we have
    if (this.data.record?.id) {
      // We're viewing a specific record from the explore page
      currentParams.set('recordId', this.data.record.id);
    } else if (this.data.reportId) {
      // We're viewing a report from the reports page
      currentParams.set('reportId', this.data.reportId);
    }
    
    // Build the shareable URL
    const shareUrl = `${baseUrl}?${currentParams.toString()}`;

    navigator.clipboard.writeText(shareUrl).then(
      () => {
        this.snackBar.open('Share link copied to clipboard', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      },
      (err) => {
        this.snackBar.open('Failed to copy share link', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    );
  }
}
