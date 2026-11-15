import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileWatcherService } from './file-watcher.service';
import { DmarcReportService } from './dmarc-report.service';

describe('FileWatcherService', () => {
  let dir: string;
  let configValues: Record<string, string>;
  const dmarcReportService = {
    unzipReport: jest.fn(),
    parseXmlReport: jest.fn(),
    createOrUpdateByReportId: jest.fn(),
  };

  const buildService = () =>
    new FileWatcherService(
      { get: (key: string) => configValues[key] } as unknown as ConfigService,
      dmarcReportService as unknown as DmarcReportService,
    );

  const writeReport = async (name: string, size: number) => {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, Buffer.alloc(size, 'a'));
    return filePath;
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-watcher-'));
    configValues = { REPORT_MAX_FILE_BYTES: '100' };
    jest.clearAllMocks();
    dmarcReportService.unzipReport.mockResolvedValue('<feedback/>');
    dmarcReportService.parseXmlReport.mockResolvedValue({ records: [] });
    dmarcReportService.createOrUpdateByReportId.mockResolvedValue(null);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('should skip files larger than REPORT_MAX_FILE_BYTES without reading them', async () => {
    const filePath = await writeReport('big.xml', 200);

    await buildService()['handleFileAdd'](filePath);

    expect(dmarcReportService.unzipReport).not.toHaveBeenCalled();
    await expect(fs.stat(filePath)).resolves.toBeDefined();
  });

  it('should delete oversized files when FILE_WATCH_DELETE_PROCESSED is true', async () => {
    configValues.FILE_WATCH_DELETE_PROCESSED = 'true';
    const filePath = await writeReport('big.xml', 200);

    await buildService()['handleFileAdd'](filePath);

    expect(dmarcReportService.unzipReport).not.toHaveBeenCalled();
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it('should process files within the limit', async () => {
    const filePath = await writeReport('ok.xml', 50);

    await buildService()['handleFileAdd'](filePath);

    expect(dmarcReportService.unzipReport).toHaveBeenCalledWith(
      expect.any(Buffer),
      'xml',
    );
  });
});
