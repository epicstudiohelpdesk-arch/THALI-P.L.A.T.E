import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, View, TouchableOpacity } from "react-native";
import { CaregiverExperience } from "../../src/features/caregiver/CaregiverExperience";
import { CaregiverProvider, useCaregiverContext } from "../../src/features/caregiver/context/CaregiverContext";
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
  const { Text, View, TouchableOpacity } = require("react-native");
  return {
    CaregiverPatientGlucoseScreen: ({
      patient,
      onAccessLost,
    }: {
      patient: CaregiverPatientListItem;
      onAccessLost?: () => void;
    }) => (
      <View testID="mocked-glucose-screen">
        <Text>Glucose Screen for {patient.name}</Text>
        <TouchableOpacity testID="trigger-access-lost" onPress={onAccessLost}>
          <Text>Simulate Access Lost</Text>
        </TouchableOpacity>
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <CaregiverExperience {...props} />
      </QueryClientProvider>
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

  // TEST 7: 403 access lost in Record tab calls clearActivePatient, refreshPatients, and navigates back to Home
  it("clears active patient, refetches list, and navigates back to Home on 403 access lost", async () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    renderExperience();

    // Navigate to Record tab
    const recordTabBtn = screen.getByLabelText("Patient health record tab");
    await act(async () => {
      fireEvent.press(recordTabBtn);
    });

    expect(screen.getByText("Glucose Screen for Aarav Sharma")).toBeTruthy();

    // Trigger access lost
    const accessLostBtn = screen.getByTestId("trigger-access-lost");
    await act(async () => {
      fireEvent.press(accessLostBtn);
    });

    // 1. refetch called
    expect(mockListState.refetch).toHaveBeenCalled();
    // 2. Active patient was cleared, so back on Home tab it shows empty state
    expect(screen.getByText("No linked patients")).toBeTruthy();
    expect(screen.getByText("Caregiver")).toBeTruthy();
  });
});

function ConsumerTestComponent() {
  const {
    activePatient,
    activePatientId,
    linkedPatients,
    isLoading,
    isError,
    selectPatient,
    clearActivePatient,
    refreshPatients,
  } = useCaregiverContext();

  return (
    <View testID="consumer-root">
      <Text testID="active-patient-id">{activePatientId ?? "null"}</Text>
      <Text testID="active-patient-name">{activePatient?.name ?? "null"}</Text>
      <Text testID="patient-count">{linkedPatients.length.toString()}</Text>
      <Text testID="loading-state">{isLoading ? "loading" : "idle"}</Text>
      <Text testID="error-state">{isError ? "error" : "ok"}</Text>
      <TouchableOpacity testID="btn-select-b" onPress={() => selectPatient("pat-2")}>
        <Text>Select B</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-select-unknown" onPress={() => selectPatient("unknown-999")}>
        <Text>Select Unknown</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-clear" onPress={clearActivePatient}>
        <Text>Clear</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-refresh" onPress={() => void refreshPatients()}>
        <Text>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

describe("CaregiverProvider and useCaregiverContext Hook Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListState = {
      patients: [],
      patientCount: 0,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  it("throws an error when useCaregiverContext is consumed outside CaregiverProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ConsumerTestComponent />)).toThrow(
      "useCaregiverContext must be used within a CaregiverProvider"
    );
    spy.mockRestore();
  });

  it("initializes with null active patient when patient list is empty", () => {
    mockListState.patients = [];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    expect(screen.getByTestId("active-patient-id").props.children).toBe("null");
    expect(screen.getByTestId("active-patient-name").props.children).toBe("null");
    expect(screen.getByTestId("patient-count").props.children).toBe("0");
  });

  it("automatically activates single linked patient", () => {
    mockListState.patients = [PATIENT_A];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-1");
    expect(screen.getByTestId("active-patient-name").props.children).toBe("Aarav Sharma");
  });

  it("defaults to first patient when multiple are present and updates on selectPatient", async () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-1");

    // Select Patient B
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-select-b"));
    });

    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-2");
    expect(screen.getByTestId("active-patient-name").props.children).toBe("Diya Sharma");
  });

  it("ignores unknown patient IDs not in linked list", async () => {
    mockListState.patients = [PATIENT_A, PATIENT_B];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-1");

    // Attempt to select unknown
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-select-unknown"));
    });

    // Stays pat-1
    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-1");
  });

  it("clears active patient when clearActivePatient is called", async () => {
    mockListState.patients = [PATIENT_A];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    expect(screen.getByTestId("active-patient-id").props.children).toBe("pat-1");

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-clear"));
    });

    expect(screen.getByTestId("active-patient-id").props.children).toBe("null");
    expect(screen.getByTestId("active-patient-name").props.children).toBe("null");
  });

  it("triggers refetch when refreshPatients is called", async () => {
    mockListState.patients = [PATIENT_A];
    render(
      <CaregiverProvider>
        <ConsumerTestComponent />
      </CaregiverProvider>
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-refresh"));
    });

    expect(mockListState.refetch).toHaveBeenCalled();
  });
});

