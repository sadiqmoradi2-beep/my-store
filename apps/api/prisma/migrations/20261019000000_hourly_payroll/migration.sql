-- Hourly payroll (additive only: a new pay type value, one nullable column, two new tables)

CREATE TYPE "WorkIntervalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
ALTER TYPE "SellerPayType" ADD VALUE 'HOURLY';
ALTER TABLE "Employee" ADD COLUMN     "hourlyRate" DECIMAL(18,2);
CREATE TABLE "EmployeeWorkInterval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "workSessionId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "recordedMinutes" INTEGER,
    "approvedMinutes" INTEGER,
    "hourlyRate" DECIMAL(18,2),
    "status" "WorkIntervalStatus" NOT NULL DEFAULT 'PENDING',
    "correctionReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "salaryPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeWorkInterval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeWorkIntervalEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intervalId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromMinutes" INTEGER,
    "toMinutes" INTEGER,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeWorkIntervalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeWorkInterval_attendanceId_key" ON "EmployeeWorkInterval"("attendanceId");
CREATE UNIQUE INDEX "EmployeeWorkInterval_workSessionId_key" ON "EmployeeWorkInterval"("workSessionId");
CREATE INDEX "EmployeeWorkInterval_tenantId_employeeId_status_idx" ON "EmployeeWorkInterval"("tenantId", "employeeId", "status");
CREATE INDEX "EmployeeWorkInterval_employeeId_startAt_idx" ON "EmployeeWorkInterval"("employeeId", "startAt");
CREATE INDEX "EmployeeWorkInterval_salaryPaymentId_idx" ON "EmployeeWorkInterval"("salaryPaymentId");
CREATE INDEX "EmployeeWorkIntervalEvent_intervalId_createdAt_idx" ON "EmployeeWorkIntervalEvent"("intervalId", "createdAt");
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "EmployeeAttendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_salaryPaymentId_fkey" FOREIGN KEY ("salaryPaymentId") REFERENCES "SalaryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkIntervalEvent" ADD CONSTRAINT "EmployeeWorkIntervalEvent_intervalId_fkey" FOREIGN KEY ("intervalId") REFERENCES "EmployeeWorkInterval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each stretch comes from exactly one source: an attendance day OR a work session
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_one_source" CHECK (num_nonnulls("attendanceId", "workSessionId") = 1);
-- Minutes are never negative
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_minutes_nonnegative" CHECK (("recordedMinutes" IS NULL OR "recordedMinutes" >= 0) AND ("approvedMinutes" IS NULL OR "approvedMinutes" >= 0));
-- PAID always has its salary payment; APPROVED/PAID always have minutes and a rate
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_paid_linked" CHECK (("status" = 'PAID') = ("salaryPaymentId" IS NOT NULL));
ALTER TABLE "EmployeeWorkInterval" ADD CONSTRAINT "EmployeeWorkInterval_approved_complete" CHECK ("status" NOT IN ('APPROVED', 'PAID') OR ("approvedMinutes" IS NOT NULL AND "hourlyRate" IS NOT NULL));
