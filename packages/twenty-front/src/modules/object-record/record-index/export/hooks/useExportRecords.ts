import { json2csv } from 'json-2-csv';
import { useMemo } from 'react';

import { FieldMetadata } from '@/object-record/record-field/types/FieldMetadata';
import {
  UseRecordDataOptions,
  useExportFetchRecords,
} from '@/object-record/record-index/export/hooks/useExportFetchRecords';
import { useExportProcessRecordsForCSV } from '@/object-record/record-index/export/hooks/useExportProcessRecordsForCSV';
import { EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE } from '@/object-record/record-index/options/constants/ExportTableDataDefaultPageSize';
import { ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { ObjectRecord } from '@/object-record/types/ObjectRecord';
import { RelationDefinitionType } from '~/generated-metadata/graphql';
import { FieldMetadataType } from '~/generated/graphql';
import { isDefined } from '~/utils/isDefined';
import { isUndefinedOrNull } from '~/utils/isUndefinedOrNull';

export const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
};

type GenerateExportOptions = {
  columns: ColumnDefinition<FieldMetadata>[];
  rows: object[];
};

type GenerateExport = (data: GenerateExportOptions) => string;

type ExportProgress = {
  exportedRecordCount?: number;
  totalRecordCount?: number;
  displayType: 'percentage' | 'number';
};

export const generateCsv: GenerateExport = ({
  columns,
  rows,
}: GenerateExportOptions): string => {
  const columnsToExport = columns.filter(
    (col) =>
      !('relationType' in col.metadata && col.metadata.relationType) ||
      col.metadata.relationType === RelationDefinitionType.ManyToOne,
  );

  const objectIdColumn: ColumnDefinition<FieldMetadata> = {
    fieldMetadataId: '',
    type: FieldMetadataType.Uuid,
    iconName: '',
    label: `Id`,
    metadata: {
      fieldName: 'id',
    },
    position: 0,
    size: 0,
  };

  const columnsToExportWithIdColumn = [objectIdColumn, ...columnsToExport];

  const keys = columnsToExportWithIdColumn.flatMap((col) => {
    const column = {
      field: `${col.metadata.fieldName}${col.type === 'RELATION' ? 'Id' : ''}`,
      title: [col.label, col.type === 'RELATION' ? 'Id' : null]
        .filter(isDefined)
        .join(' '),
    };

    const fieldsWithSubFields = rows.find((row) => {
      const fieldValue = (row as any)[column.field];

      const hasSubFields =
        fieldValue &&
        typeof fieldValue === 'object' &&
        !Array.isArray(fieldValue);

      return hasSubFields;
    });

    if (isDefined(fieldsWithSubFields)) {
      const nestedFieldsWithoutTypename = Object.keys(
        (fieldsWithSubFields as any)[column.field],
      )
        .filter((key) => key !== '__typename')
        .map((key) => ({
          field: `${column.field}.${key}`,
          title: `${column.title} ${key[0].toUpperCase() + key.slice(1)}`,
        }));

      return nestedFieldsWithoutTypename;
    }

    return [column];
  });

  return json2csv(rows, {
    keys,
    emptyFieldValue: '',
  });
};

const percentage = (part: number, whole: number): number => {
  return Math.round((part / whole) * 100);
};

export const displayedExportProgress = (
  mode: 'all' | 'selection' = 'all',
  progress?: ExportProgress,
): string => {
  if (isUndefinedOrNull(progress?.exportedRecordCount)) {
    return mode === 'all' ? 'Export View as CSV' : 'Export Selection as CSV';
  }

  if (
    progress.displayType === 'percentage' &&
    isDefined(progress?.totalRecordCount)
  ) {
    return `Export (${percentage(
      progress.exportedRecordCount,
      progress.totalRecordCount,
    )}%)`;
  }

  return `Export (${progress.exportedRecordCount})`;
};

const downloader = (mimeType: string, generator: GenerateExport) => {
  return (filename: string, data: GenerateExportOptions) => {
    const blob = new Blob([generator(data)], { type: mimeType });
    download(blob, filename);
  };
};

export const csvDownloader = downloader('text/csv', generateCsv);

type UseExportTableDataOptions = Omit<UseRecordDataOptions, 'callback'> & {
  filename: string;
};

export const useExportRecords = ({
  delayMs,
  filename,
  maximumRequests = 100,
  objectMetadataItem,
  pageSize = EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE,
  recordIndexId,
  viewType,
}: UseExportTableDataOptions) => {
  const { processRecordsForCSVExport } = useExportProcessRecordsForCSV(
    objectMetadataItem.nameSingular,
  );

  const downloadCsv = useMemo(
    () =>
      (records: ObjectRecord[], columns: ColumnDefinition<FieldMetadata>[]) => {
        const recordsProcessedForExport = processRecordsForCSVExport(records);

        csvDownloader(filename, { rows: recordsProcessedForExport, columns });
      },
    [filename, processRecordsForCSVExport],
  );

  const { getTableData: download, progress } = useExportFetchRecords({
    delayMs,
    maximumRequests,
    objectMetadataItem,
    pageSize,
    recordIndexId,
    callback: downloadCsv,
    viewType,
  });

  return { progress, download };
};
