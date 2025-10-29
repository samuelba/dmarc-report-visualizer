import { Component, Inject, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';

import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-highlight/prism-line-highlight';
import { ApiService, DmarcRecord } from '../../services/api.service';

export interface XmlViewerDialogData {
  xml: string;
  record?: DmarcRecord;
  reportId?: string;
  title?: string;
}

@Component({
  selector: 'app-xml-viewer-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './xml-viewer-dialog.component.html',
  styleUrls: ['./xml-viewer-dialog.component.scss'],
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
    private dialog: MatDialog,
    private api: ApiService
  ) {}

  ngOnInit() {
    if (this.data?.xml) {
      this.processXml();
    } else if (this.data?.reportId) {
      // Lazy-load XML if not provided
      this.api.getReportXml(this.data.reportId).subscribe({
        next: (xml) => this.setXml(xml),
      });
    }
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

  // Allow late XML injection (used by flip animation orchestration)
  public setXml(xml: string) {
    this.data.xml = xml || '';
    this.processXml();

    // Re-run Prism highlighting if view initialized
    setTimeout(() => {
      if (this.xmlContent?.nativeElement) {
        const pre = this.xmlContent.nativeElement;
        Prism.highlightAllUnder(pre.parentElement);
      }
    }, 0);
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
    } catch (_e) {
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
        .map((attr) => ` ${attr.name}="${attr.value}"`)
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
      children.forEach((child) => {
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
      if (!ipMatch) {
        return false;
      }
      matchCount++;
    }

    // Match based on count (required)
    if (record.count !== undefined && record.count !== null) {
      checkCount++;
      const countMatch = recordXml.includes(`<count>${record.count}</count>`);
      if (!countMatch) {
        return false;
      }
      matchCount++;
    }

    // Match based on disposition (in policy_evaluated section) - REQUIRED if present
    if (record.disposition) {
      checkCount++;
      const dispositionMatch = recordXml.includes(`<disposition>${record.disposition}</disposition>`);
      if (!dispositionMatch) {
        return false; // Must match if specified
      }
      matchCount++;
    }

    // Match based on DKIM policy evaluated (in policy_evaluated section) - REQUIRED if present
    if (record.dmarcDkim) {
      checkCount++;
      const dkimMatch = recordXml.includes(`<dkim>${record.dmarcDkim}</dkim>`);
      if (!dkimMatch) {
        return false; // Must match if specified
      }
      matchCount++;
    }

    // Match based on SPF policy evaluated (in policy_evaluated section) - REQUIRED if present
    if (record.dmarcSpf) {
      checkCount++;
      const spfMatch = recordXml.includes(`<spf>${record.dmarcSpf}</spf>`);
      if (!spfMatch) {
        return false; // Must match if specified
      }
      matchCount++;
    }

    // Match based on header_from (identifiers section)
    if (record.headerFrom) {
      checkCount++;
      const headerFromMatch = recordXml.includes(`<header_from>${record.headerFrom}</header_from>`);
      if (headerFromMatch) {
        matchCount++;
      }
    }

    // Match based on envelope_to (identifiers section)
    if (record.envelopeTo) {
      checkCount++;
      const envelopeToMatch = recordXml.includes(`<envelope_to>${record.envelopeTo}</envelope_to>`);
      if (envelopeToMatch) {
        matchCount++;
      }
    }

    // Match based on envelope_from (identifiers section)
    if (record.envelopeFrom) {
      checkCount++;
      const envelopeFromMatch = recordXml.includes(`<envelope_from>${record.envelopeFrom}</envelope_from>`);
      if (envelopeFromMatch) {
        matchCount++;
      }
    }

    // Match based on DKIM auth results (from auth_results section)
    if (record.dkimResults && record.dkimResults.length > 0) {
      // Check if all DKIM results match
      let allDkimMatch = true;
      for (const dkim of record.dkimResults) {
        const dkimObj = dkim as any;
        // Check for domain, selector, and result presence
        let thisDkimMatches = true;

        if (dkimObj.domain) {
          const domainInXml = recordXml.includes(`<domain>${dkimObj.domain}</domain>`);
          if (!domainInXml) {
            thisDkimMatches = false;
          }
        }

        if (thisDkimMatches && dkimObj.selector) {
          const selectorInXml = recordXml.includes(`<selector>${dkimObj.selector}</selector>`);
          if (!selectorInXml) {
            thisDkimMatches = false;
          }
        }

        if (thisDkimMatches && dkimObj.result) {
          // Look for result within a dkim auth result block (not policy_evaluated)
          // We need to be more specific - check if this domain/selector/result combination exists
          const dkimPattern = new RegExp(
            `<dkim>\\s*<domain>${this.escapeRegex(dkimObj.domain || '')}</domain>\\s*<selector>${this.escapeRegex(dkimObj.selector || '')}</selector>\\s*<result>${this.escapeRegex(dkimObj.result)}</result>`,
            'i'
          );
          if (!dkimPattern.test(recordXml)) {
            thisDkimMatches = false;
          }
        }

        if (!thisDkimMatches) {
          allDkimMatch = false;
          break;
        }
      }

      if (allDkimMatch) {
        checkCount++;
        matchCount++;
      }
    }

    // Match based on SPF auth results (from auth_results section)
    if (record.spfResults && record.spfResults.length > 0) {
      // Check if all SPF results match
      let allSpfMatch = true;
      for (const spf of record.spfResults) {
        const spfObj = spf as any;
        // Check for domain and result presence
        let thisSpfMatches = true;

        if (spfObj.domain && spfObj.result) {
          // Look for domain and result within an spf auth result block
          const spfPattern = new RegExp(
            `<spf>\\s*<domain>${this.escapeRegex(spfObj.domain)}</domain>.*?<result>${this.escapeRegex(spfObj.result)}</result>`,
            'is'
          );
          if (!spfPattern.test(recordXml)) {
            thisSpfMatches = false;
          }
        }

        if (!thisSpfMatches) {
          allSpfMatch = false;
          break;
        }
      }

      if (allSpfMatch) {
        checkCount++;
        matchCount++;
      }
    }

    // We need at least source_ip and count to match, plus at least 2 more fields
    // Increase required matches if we have auth results to be more specific
    const requiredMatches = Math.min(checkCount > 4 ? 5 : 4, checkCount);
    const isMatch = matchCount >= requiredMatches;

    return isMatch;
  }

  // Helper method to escape special regex characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  scrollToHighlight() {
    if (!this.highlightedLines) {
      return;
    }

    const container = this.xmlContent?.nativeElement?.closest('mat-dialog-content');
    if (!container) {
      return;
    }

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
      (_err) => {
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
    const filename = this.data.reportId ? `dmarc-report-${this.data.reportId}.xml` : `dmarc-report-${timestamp}.xml`;

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
      (_err) => {
        this.snackBar.open('Failed to copy share link', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    );
  }

  async viewRecordDetails() {
    if (!this.data.record) {
      this.dialogRef.close();
      return;
    }

    // Add flip classes to current dialog pane
    // Remove any stale flip state from previous flips
    this.dialogRef.removePanelClass('flip-enter');
    this.dialogRef.removePanelClass('flip-enter-reverse');
    this.dialogRef.removePanelClass('flip-exit');
    this.dialogRef.removePanelClass('flip-exit-reverse');
    this.dialogRef.addPanelClass('flip-dialog');
    // Reverse exit: rotate 0 -> -180deg
    this.dialogRef.addPanelClass('flip-exit-reverse');

    // Open the Details dialog immediately with flip-enter
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const { RecordDetailsDialogComponent } = await import('../record-details-dialog/record-details-dialog.component');
    const detailsRef = this.dialog.open(RecordDetailsDialogComponent, {
      data: {
        record: this.data.record,
        getCountryName: (code?: string) => {
          if (!code) {
            return '';
          }
          try {
            return regionNames.of(code.toUpperCase()) || code;
          } catch {
            return code;
          }
        },
      },
      width: '850px',
      maxWidth: '90vw',
      height: '95vh',
      // Reverse enter: start at 180 -> 0deg
      panelClass: ['flip-dialog', 'flip-enter-reverse'],
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
    });

    // After flip-in completes, clear flip-enter-reverse on the new dialog
    setTimeout(() => detailsRef.removePanelClass('flip-enter-reverse'), 650);

    // Close this dialog after the flip duration
    setTimeout(() => this.dialogRef.close({ action: 'flip' }), 600);
  }
}
