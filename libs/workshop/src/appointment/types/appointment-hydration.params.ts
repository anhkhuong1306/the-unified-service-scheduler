export interface HydratedDealership {
  id: string;
  code: string;
  name: string;
}

export interface HydratedCustomer {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface HydratedTechnician {
  id: string;
  code: string;
  name: string;
}

export interface HydratedServiceBay {
  id: string;
  code: string;
}

export interface HydratedVehicle {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  vehicleLabel: string;
}

export interface HydratedServiceTypeDetail {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
}
