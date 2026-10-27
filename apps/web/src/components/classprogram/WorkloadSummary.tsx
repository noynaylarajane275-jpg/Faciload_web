import type { FacultyMember } from '../../lib/faculty';
import type { Term } from '../../lib/terms';
import type { OtherFunctionType } from '../../lib/other-function-sessions';

export interface WorkloadSummaryProps {
  faculty?: FacultyMember | null;
  term?: Term | null;
  lectureHrs: number;
  labHrs: number;
  totalHrs: number;
  numPreparations: number;
  otherFunctionTotals?: Record<OtherFunctionType, number>;
  serviceCredits?: number;
  teachingOverload?: number;
  totalStudents?: number;
  otherFunctions?: { research: number; extension: number; designation: number };
  designations?: Array<{ id: string; name: string; totalHours: number }>;
}

export function WorkloadSummary({
  faculty,
  term,
  lectureHrs = 0,
  labHrs = 0,
  totalHrs = 0,
  numPreparations = 0,
  otherFunctionTotals = {
    RESEARCH: 0,
    EXTENSION: 0,
    IMP: 0,
    CONSULTATION: 0,
  },
  serviceCredits,
  teachingOverload,
  totalStudents,
  otherFunctions,
  designations = [],
}: WorkloadSummaryProps): JSX.Element {
  const otherFunctionTotal = Object.values(otherFunctionTotals).reduce(
    (sum, hours) => sum + hours,
    0,
  );
  const grandTotal = totalHrs + otherFunctionTotal;
  const designationTotal = designations.reduce(
    (sum, designation) => sum + designation.totalHours,
    0,
  );
  const otherFunctionRows: Array<[OtherFunctionType, string]> = [
    ['RESEARCH', 'Research'],
    ['EXTENSION', 'Extension'],
    ['IMP', 'IMP'],
    ['CONSULTATION', 'Consultation'],
  ];

  return (
    <div className="space-y-2">
      <table className="w-full border-collapse text-sm text-black">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left pb-1 font-bold">Workload</th>
            <th className="text-center pb-1 font-bold">Lecture Hrs/Wk</th>
            <th className="text-center pb-1 font-bold">Lab Hrs./Wk</th>
            <th className="text-center pb-1 font-bold">Total</th>
            <th className="text-left pb-1 font-bold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black">
            <td className="py-1 font-bold">A. Teaching Load:</td>
            <td className="text-center py-1">{lectureHrs}</td>
            <td className="text-center py-1">{labHrs}</td>
            <td className="text-center py-1">{totalHrs}</td>
            <td className="py-1">
              No. of Preparations: {numPreparations}
            </td>
          </tr>
          <tr>
            <td className="py-1" colSpan={5}>
              Service Credits:{serviceCredits !== undefined ? ` ${serviceCredits}` : ''}
            </td>
          </tr>
          <tr className="border-t border-black">
            <td className="py-1" colSpan={5}>
              Teaching Overload:{teachingOverload !== undefined ? ` ${teachingOverload}` : ''}
            </td>
          </tr>
          <tr>
            <td className="py-1 font-bold">Sub-Total</td>
            <td className="text-center py-1">{lectureHrs}</td>
            <td className="text-center py-1">{labHrs}</td>
            <td className="text-center py-1">{totalHrs}</td>
            <td className="py-1" />
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-sm text-black mt-2">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left pb-1 font-bold">B. Other Functions:</th>
            <th className="text-center pb-1 font-bold">Hours/Wk</th>
            <th className="text-left pb-1 font-bold">Total Number of Students:</th>
          </tr>
        </thead>
        <tbody>
          {otherFunctionRows.map(([type, label]) => (
            <tr key={type} className="border-b border-black">
              <td className="py-1">{label}</td>
              <td className="py-1 text-center">{otherFunctionTotals[type]}</td>
              <td className="py-1">{type === 'RESEARCH' ? totalStudents ?? 0 : ''}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1 font-bold">Sub-Total</td>
            <td className="py-1 text-center font-bold">{otherFunctionTotal}</td>
            <td className="py-1" />
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-sm text-black mt-2">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left pb-1 font-bold">C. Designation</th>
            <th className="text-center pb-1 font-bold">Hours/Wk</th>
          </tr>
        </thead>
        <tbody>
          {designations.map((designation) => (
            <tr key={designation.id} className="border-b border-black">
              <td className="py-1">{designation.name}</td>
              <td className="py-1 text-center">{designation.totalHours}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1 font-bold">Sub-Total</td>
            <td className="py-1 text-center font-bold">{designationTotal}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-sm text-black mt-2">
        <tbody>
          <tr className="border-t border-black">
            <td className="py-1 font-bold">Grand Total (A+B+C)</td>
            <td className="text-center py-1 font-bold">{grandTotal + designationTotal}</td>
          </tr>
        </tbody>
      </table>

      {/* Approval signature section */}
      <div className="mt-4">
        <table className="w-full border-collapse text-sm text-black">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left pb-1 font-bold">ACTION TAKEN</th>
              <th className="text-left pb-1 font-bold">NAME</th>
              <th className="text-left pb-1 font-bold">POSITION</th>
              <th className="text-left pb-1 font-bold">SIGNATURE</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black h-8">
              <td className="py-1 font-bold">Prepared by:</td>
              <td className="py-1">{faculty ? `${faculty.first_name} ${faculty.last_name}` : ''}</td>
              <td className="py-1">Faculty</td>
              <td className="py-1" />
            </tr>
            <tr className="border-b border-black h-8">
              <td className="py-1 font-bold">Reviewed by:</td>
              <td className="py-1" />
              <td className="py-1">Chair</td>
              <td className="py-1" />
            </tr>
            <tr className="border-b border-black h-8">
              <td className="py-1 font-bold">Verified by:</td>
              <td className="py-1" />
              <td className="py-1">Dean, COTE</td>
              <td className="py-1" />
            </tr>
            <tr className="h-8">
              <td className="py-1 font-bold">Approved by:</td>
              <td className="py-1" />
              <td className="py-1">VP-Academic Affairs</td>
              <td className="py-1" />
            </tr>
          </tbody>
        </table>

        <div className="mt-2 text-sm text-left">
          Effective: ____________________
        </div>
      </div>
    </div>
  );
}