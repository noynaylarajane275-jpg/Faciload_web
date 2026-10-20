import type { Term } from '../../lib/terms';
import type { FacultyMember } from '../../lib/faculty';
import { SCHOOL_LOGO_CANDIDATES, schoolLogoUrl } from './logo';

/**
 * Document defaults shared with the Excel export builder
 * (lib/class-program-export.ts) so screen and sheet can never drift apart.
 */
export const DEFAULT_COLLEGE = 'COLLEGE OF TECHNOLOGY AND ENGINEERING';
export const DEFAULT_DEPARTMENT = 'Industrial Technology';
export const DEFAULT_REF_CODE = 'PIT-COTE-FOR-3-2-01B';
export const DEFAULT_REV_NO = '00';
export const DEFAULT_REV_BY = 'QMS-DIRC';
export const DEFAULT_APP_BY = '';
export const DEFAULT_DATE = 'October 21, 2026';
export const DEFAULT_PAGE_NO = '1 of 1';
export const DEFAULT_PREP_BY = 'Process Owner';

export const INSTITUTION_LINES = [
  'Republic of the Philippines',
  'PALOMPON INSTITUTE OF TECHNOLOGY',
  'Palompon, Leyte',
] as const;

export const DOC_TITLE = "INSTRUCTOR'S CLASS PROGRAM";

/** How the official form writes the term: "Second Sem., S.Y. 2026-2027". */
export function officialTermLabel(schoolYear: string): string {
  return `Second Sem., S.Y. ${schoolYear}`;
}

/**
 * One logo cell of the official header. The source comes from the existing
 * public assets only; a missing or broken file collapses to an empty box so
 * the printed form never shows a broken-image glyph, and `object-contain`
 * keeps the file's original proportions.
 */
function DocumentLogo({ src, alt }: { src: string | null; alt: string }): JSX.Element {
  if (!src) return <span aria-hidden="true" className="block h-16" />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="mx-auto block h-auto max-h-24 w-auto max-w-full object-contain"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

export interface OfficialHeaderProps {
  faculty?: FacultyMember | null;
  term?: Term | null;
  college?: string;
  department?: string;
  refCode?: string;
  revNo?: string;
  revBy?: string;
  apprBy?: string;
  date?: string;
  pageNo?: string;
  prepBy?: string;
  /** Program effectivity window — both ends when the data carries them. */
  effectivityStart?: string;
  effectivityEnd?: string;
}

export function OfficialHeader({
  faculty,
  term,
  college = DEFAULT_COLLEGE,
  department = DEFAULT_DEPARTMENT,
  refCode = DEFAULT_REF_CODE,
  revNo = DEFAULT_REV_NO,
  revBy = DEFAULT_REV_BY,
  apprBy = DEFAULT_APP_BY,
  date = DEFAULT_DATE,
  pageNo = DEFAULT_PAGE_NO,
  prepBy = DEFAULT_PREP_BY,
  effectivityStart,
  effectivityEnd,
}: OfficialHeaderProps): JSX.Element {
  const facultyName = faculty
    ? `${faculty.first_name} ${faculty.last_name}`
    : '_________________________';
  const academicRank = faculty?.rank ?? '_________________';
  const termLabel = term ? officialTermLabel(term.school_year) : '_________________';
  // A start-end window prints both ends; otherwise fall back to one date.
  const effectivityDate =
    effectivityStart && effectivityEnd
      ? `${effectivityStart} – ${effectivityEnd}`
      : (effectivityStart ?? effectivityEnd ?? date);

  return (
    <table
      className="official-header w-full table-fixed border-collapse text-black"
      aria-label="Official document header"
    >
      {/*
        Mirrors the official sheet's six columns: A and B are the two seal
        boxes (rows 1-7), C:E the institution block centred inside its own
        column span, and F the document-control block aligned on the right.
      */}
      <colgroup>
        <col style={{ width: '13%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '30%' }} />
      </colgroup>

      <tbody>
        <tr>
          <td rowSpan={7} className="border border-black p-1 align-middle text-center">
            <DocumentLogo src={schoolLogoUrl()} alt="Palompon Institute of Technology seal" />
          </td>
          <td rowSpan={7} className="border border-black p-1 align-middle text-center">
            <DocumentLogo
              src={SCHOOL_LOGO_CANDIDATES[1] ?? null}
              alt="Palompon Institute of Technology logo"
            />
          </td>
          <td colSpan={3} className="p-1 text-center text-sm font-medium">
            {INSTITUTION_LINES[0]}
          </td>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Ref. Code : {refCode}
          </td>
        </tr>
        <tr>
          <td colSpan={3} className="p-1 text-center text-base font-bold">
            {INSTITUTION_LINES[1]}
          </td>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Rev. No.    : {revNo}
          </td>
        </tr>
        <tr>
          <td colSpan={3} className="p-1 text-center text-sm font-medium">
            {INSTITUTION_LINES[2]}
          </td>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Page No.   : {pageNo}
          </td>
        </tr>
        <tr>
          <td colSpan={3} className="p-1 text-center text-sm" />
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Date            : {date}
          </td>
        </tr>
        <tr>
          <td colSpan={3} className="p-1 text-center text-sm font-bold">
            {college}
          </td>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Prep. By    : {prepBy}
          </td>
        </tr>
        <tr>
          <td colSpan={3} rowSpan={2} className="p-1 text-center text-base font-bold">
            {DOC_TITLE}
          </td>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Rev. by      : {revBy}
          </td>
        </tr>
        <tr>
          <td className="whitespace-nowrap p-1 pl-3 text-right text-[11px] font-medium">
            Appr. By   : {apprBy}
          </td>
        </tr>
        <tr aria-hidden="true">
          <td colSpan={6} className="h-2 border-0 p-0" />
        </tr>
        <tr>
          <td className="whitespace-nowrap p-1 pr-2 text-left text-sm font-medium">
            Name:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {facultyName}
          </td>
          <td className="whitespace-nowrap p-1 pr-2 text-right text-sm font-medium">
            Term:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {termLabel}
          </td>
        </tr>
        <tr>
          <td className="whitespace-nowrap p-1 pr-2 text-left text-sm font-medium">
            Academic Rank:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {academicRank}
          </td>
          <td className="whitespace-nowrap p-1 pr-2 text-right text-sm font-medium">
            Department:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {department}
          </td>
        </tr>
        <tr>
          <td className="whitespace-nowrap p-1 pr-2 text-left text-sm font-medium">
            Effectivity:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {effectivityDate}
          </td>
          <td className="whitespace-nowrap p-1 pr-2 text-right text-sm font-medium">
            College:
          </td>
          <td
            colSpan={2}
            className="whitespace-nowrap border-b border-black p-1 pb-0.5 pl-1 text-left text-sm"
          >
            {college}
          </td>
        </tr>
      </tbody>
    </table>
  );
}