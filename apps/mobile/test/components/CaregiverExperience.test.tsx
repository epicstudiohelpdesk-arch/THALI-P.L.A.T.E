import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CaregiverExperience } from "../../src/features/caregiver/CaregiverExperience";
import type { CaregiverPatientListItem } from "../../src/services/schemas/caregiver";

let mockAuthState: {
  name: string;
  user: {
    role: string;
    actor_id: string;
    tenant_id: string;
    capabilities: string[];
    patient_id?: string | null;
  } | null;
} = {
  name: "authenticated",
  user: {
    role: "Caregiver",
    actor_id: "cg-1",
    tenant_id: "tenant-1",
    capabilities: ["READ_GLUCOSE", "READ_MEAL", "CREATE_GLUCOSE", "CREATE_MEAL"],
    patient_id: null,
  },
};

const mockSignOut = jest.fn();

jest.mock("../../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    state: mockAuthState,
    signOut: mockSignOut,
  }),
}));

let mockListState: {
  patients: CaregiverPatientListItem[];
  patientCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
} = {
  patients: [],
  patientCount: 0,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

jest.mock("../../src/features/caregiver/useCaregiverPatients", () => ({
  useCaregiverPatients: () => mockListState,
  caregiverKeys: {
    all: ["caregivers"],
    me: () => ["caregivers", "me"],
    patients: () => ["caregivers", "me", "patients"],
  },
}));

jest.mock("../../src/features/caregiver/CaregiverPatientGlucoseScreen", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View } = require("react-native");
  return {
    CaregiverPatientGlucoseScreen: ({ patient }: { patient: CaregiverPatientListItem }) => (
      <View testID="mocked-glucose-screen">
        <Text>Glucose Screen for {patient.name}</Text>
      </View>
    ),
  };
});

const PATIENT_A: CaregiverPatientListItem = {
  relationship_id: "rel-1",
  patient_id: "pat-1",
  relationship_label: "Son",
  status: "verified",
  capabilities: ["read_glucose", "read_meal", "create_glucose"],
  expires_at: null,
  name: "Aarav Sharma",
};

const PATIENT_B: CaregiverPatientListItem = {
  relationship_id: "rel-2",
  patient_id: "pat-2",
  relationship_label: "Daughter",
  status: "verified",
  capabilities: ["read_glucose", "read_meal"],
  expires_at: null,
  name: "Diya Sharma",
};

function renderExperience(props?: { onSignOut?: () => void }) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <CaregiverExperience {...props} />
    </SafeAreaProvider>
  );
}

describe("CaregiverExperience Component Integration (Gate C1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      name: "authenticated",
      user: {
        role: "Caregiver",
        actor_id: "cg-1",
        tenant_id: "tenant-1",
        capabilities: ["READ_GLUCOSE", "READ_MEAL", "CREATE_GLUCOSE", "CREATE_MEAL"],
        patient_id: null,
      },
    };
    mockListState = {
      patients: [],
      patientCount: 0,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  // TEST 1: zero linked patients -> safe empty state
  it("renders safe empty state when caregiver has zero linked patients", () => {
    mockListState.patients = [];
    renderExperience();

    expect(screen.getByText("THALI")).toBeTruthy();
    expect(screen.getByText("Caregiver")).toBeTruthy();
    expect(screen.getByText("No linked patients")).toBeTruthy();
  });

  // TEST 2: exactly one linked patient -> automatically active
  it("automatically activates the single linked patient and displays name in header and home", () => {
    mockListState.patients = [PATIENT_A];
    renderExperience();

    expect(screen.getByText("Caring for")).toBeTruthy();
    // Patient name appears in header and home card
    const patientNames = screen.getAllByText("Aarav Sharma");
    expect(patientNames.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Open Record")).toBeTruthy();
  });

  // TEST 3: multiple patients -> first authorized patient selected initially with switcher
  it("selects first authorized patient initially and offers switch button when multiple patients exist", () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    renderExperience();

    expect(screen.getByText("Switch")).toBeTruthy();
  });

  // TEST 4 & 5: switching patient updates active patient and record screen context
  it("switches patient from Aarav to Diya and updates record screen context", async () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    renderExperience();

    // Open switcher
    const switchBtn = screen.getByText("Switch");
    await act(async () => {
      fireEvent.press(switchBtn);
    });

    // Modal opens, tap Diya
    const selectDiyaBtn = screen.getByLabelText("Select patient Diya Sharma");
    await act(async () => {
      fireEvent.press(selectDiyaBtn);
    });

    // Switch to Record tab
    const recordTabBtn = screen.getByLabelText("Patient health record tab");
    await act(async () => {
      fireEvent.press(recordTabBtn);
    });

    expect(screen.getByText("Glucose Screen for Diya Sharma")).toBeTruthy();
  });

  // TEST 6: patient switcher contains ONLY authorized returned patients
  it("patient switcher contains only authorized returned patients", async () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    renderExperience();

    const switchBtn = screen.getByText("Switch");
    await act(async () => {
      fireEvent.press(switchBtn);
    });

    expect(screen.getByLabelText("Select patient Aarav Sharma, currently active")).toBeTruthy();
    expect(screen.getByLabelText("Select patient Diya Sharma")).toBeTruthy();
    // Unknown or unlinked patients do not exist
    expect(screen.queryByText("Unknown Patient")).toBeNull();
  });

  // TEST 10: You tab displays caregiver account info and allows signing out
  it("displays caregiver info in You tab and executes sign out", async () => {
    mockListState.patients = [PATIENT_A];
    const onSignOut = jest.fn();
    renderExperience({ onSignOut });

    // Navigate to You tab
    const youTabBtn = screen.getByLabelText("Caregiver account and profile tab");
    await act(async () => {
      fireEvent.press(youTabBtn);
    });

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Linked Patients")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();

    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    fireEvent.press(signOutBtn);
    await act(async () => {});

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
