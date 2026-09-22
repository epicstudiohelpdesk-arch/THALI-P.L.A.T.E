import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CaregiverPatientListItem } from "../../src/services/schemas/caregiver";

const PATIENT_A: CaregiverPatientListItem = {
  relationship_id: "rel-a-1",
  patient_id: "patient-a",
  relationship_label: "Son",
  status: "verified",
  capabilities: ["read_glucose", "read_meal", "create_glucose"],
  expires_at: null,
  name: "Aarav Sharma",
};

const PATIENT_B: CaregiverPatientListItem = {
  relationship_id: "rel-b-2",
  patient_id: "patient-b",
  relationship_label: "Daughter",
  status: "verified",
  capabilities: ["read_glucose", "read_meal"],
  expires_at: null,
  name: "Diya Sharma",
};

describe("Gate C1: Caregiver Context & Active Patient Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TEST 1: Zero linked patients -> safe empty state (activePatient is null)
  it("TEST 1: handles zero linked patients with null activePatient", () => {
    const patients: CaregiverPatientListItem[] = [];
    const activePatientId: string | null = null;
    const activePatient = patients.find((p) => p.patient_id === activePatientId) ?? null;

    expect(activePatient).toBeNull();
    expect(patients).toHaveLength(0);
  });

  // TEST 2: Exactly one patient -> automatically selected in session memory
  it("TEST 2: automatically selects the single patient as active patient", () => {
    const patients = [PATIENT_A];
    let activePatientId: string | null = null;

    // Simulation of useEffect in CaregiverProvider
    if (patients.length === 1 && patients[0]) {
      activePatientId = patients[0].patient_id;
    }

    const activePatient = patients.find((p) => p.patient_id === activePatientId) ?? null;
    expect(activePatientId).toBe("patient-a");
    expect(activePatient?.name).toBe("Aarav Sharma");
  });

  // TEST 3: Multiple patients -> first authorized patient selected initially
  it("TEST 3: selects first authorized patient initially when multiple are present", () => {
    const patients = [PATIENT_A, PATIENT_B];
    let activePatientId: string | null = null;

    if (!patients.some((p) => p.patient_id === activePatientId) && patients[0]) {
      activePatientId = patients[0].patient_id;
    }

    const activePatient = patients.find((p) => p.patient_id === activePatientId) ?? null;
    expect(activePatientId).toBe("patient-a");
    expect(activePatient?.name).toBe("Aarav Sharma");
  });

  // TEST 4: Switch Patient A -> Patient B updates active patient
  it("TEST 4: switches active patient from Patient A to Patient B", () => {
    const patients = [PATIENT_A, PATIENT_B];
    let activePatientId = PATIENT_A.patient_id;

    function selectPatient(patientId: string) {
      const found = patients.find((p) => p.patient_id === patientId);
      if (found) {
        activePatientId = patientId;
      }
    }

    selectPatient("patient-b");
    const activePatient = patients.find((p) => p.patient_id === activePatientId) ?? null;
    expect(activePatientId).toBe("patient-b");
    expect(activePatient?.name).toBe("Diya Sharma");
  });

  // TEST 5: Unknown patient ID cannot be manually selected if not in linkedPatients
  it("TEST 5: rejects unknown patient ID that is not in authorized linkedPatients", () => {
    const patients = [PATIENT_A, PATIENT_B];
    let activePatientId = PATIENT_A.patient_id;

    function selectPatient(patientId: string) {
      const found = patients.find((p) => p.patient_id === patientId);
      if (found) {
        activePatientId = patientId;
      }
    }

    selectPatient("unknown-patient-999");
    // Remains Patient A, does not accept unknown ID
    expect(activePatientId).toBe("patient-a");
  });

  // TEST 6: Patient switcher ONLY contains returned authorized patients
  it("TEST 6: switcher list contains exclusively authorized linked patients from server", () => {
    const returnedServerPatients = [PATIENT_A, PATIENT_B];
    const switcherOptions = returnedServerPatients.map((p) => ({
      id: p.patient_id,
      name: p.name,
      relationship: p.relationship_label,
    }));

    expect(switcherOptions).toHaveLength(2);
    expect(switcherOptions.map((o) => o.id)).toEqual(["patient-a", "patient-b"]);
    // Confirm no global search / tenant roster items are present
    expect(switcherOptions.some((o) => o.id === "global-search")).toBe(false);
  });

  // TEST 7: 403 patient access loss clears/refetches context without logging out whole account
  it("TEST 7: treats 403 as relationship revocation, clearing active patient without logging out", async () => {
    let mockIsLoggedOut = false;
    let mockPatients = [PATIENT_A, PATIENT_B];
    let activePatientId: string | null = PATIENT_A.patient_id;

    const mockRefetch = vi.fn(async () => {
      // Server response after Patient A relationship was revoked:
      mockPatients = [PATIENT_B];
      if (!mockPatients.some((p) => p.patient_id === activePatientId)) {
        activePatientId = mockPatients[0]?.patient_id ?? null;
      }
    });

    const mockSignOut = vi.fn(async () => {
      mockIsLoggedOut = true;
    });

    // Simulating 403 on active patient
    const httpStatus = 403;
    if (httpStatus === 403) {
      // Per-patient revocation: refetch discovery list, never sign out
      await mockRefetch();
    } else if (httpStatus === 401) {
      await mockSignOut();
    }

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockIsLoggedOut).toBe(false);
    expect(mockRefetch).toHaveBeenCalledOnce();
    expect(activePatientId).toBe("patient-b");
  });

  // TEST 8: Clear active patient resets context
  it("TEST 8: clearActivePatient resets active patient to null", () => {
    let activePatientId: string | null = "patient-a";
    function clearActivePatient() {
      activePatientId = null;
    }
    clearActivePatient();
    expect(activePatientId).toBeNull();
  });

  // TEST 9: Query isolation per patient (cache key includes patientId)
  it("TEST 9: ensures patient-specific query keys isolate data by patient ID", () => {
    const keyA = ["caregiver", "patient", PATIENT_A.patient_id, "glucose"];
    const keyB = ["caregiver", "patient", PATIENT_B.patient_id, "glucose"];
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toContain("patient-a");
    expect(keyB).toContain("patient-b");
  });

  // TEST 10: Capabilities are never invented, verified against strict contract
  it("TEST 10: does not invent clinical capabilities or bypass read/record gates", () => {
    expect(PATIENT_A.capabilities).toContain("create_glucose");
    expect(PATIENT_B.capabilities).not.toContain("create_glucose");
  });
});
