/* global getAssetRegistry getFactory emit query */

/**
 * Track the enrollment of a patient in the trial, with a confidential ID number
 * @param {org.metapharma.PatientEnrollment} enrollment - the patient to be enrolled
 * @transaction
 */
async function newpatient(enrollment) { // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.metapharma';

    // create the patient's record
    const patient = factory.newResource(NS, 'Patient', enrollment.patientId);
    patient.patientId = enrollment.patientId;
    patient.hospital = enrollment.hospital;
    patient.status = "ENROLLED";
    patient.injectionsReceived = 0;

    // add the patient's record to the registry
    const patientRegistry = await getAssetRegistry('org.metapharma.Patient');
    await patientRegistry.addAll([patient]);

    // emit a notification that a patient enrolled
    const enrollmentNotification = getFactory().newEvent('org.metapharma', 'EnrollmentNotification');
    enrollmentNotification.patient = enrollment.patient;
    emit(enrollmentNotification);
}

/**
 * Track an update to the status of a patient, including selection or rejection
 * to the trial, or to record an adverse effect.
 * @param {org.metapharma.UpdatePatient} update - the patient record to be processed
 * @transaction
 */
async function patientUpdate(update) { // eslint-disable-line no-unused-vars

    // set the new attributes of the patient's record
    update.patient.status = update.status;
    const assetRegistry = await getAssetRegistry('org.metapharma.Patient');

    // emit a notification that a patient's record was changed
    const patientUpdate = getFactory().newEvent('org.metapharma', 'UpdateNotification');
    patientUpdate.patient = update.patient;
    emit(patientUpdate);

    // persist the state of the patient's record
    await assetRegistry.update(update.patient);
}

/**
 * Track the finished production of a drug at the manufacturer
 * @param {org.metapharma.Manufactures} manufactures - the asset to be processed
 * @transaction
 */
async function newdrug(manufactures) { // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.metapharma';

    // create the drug
    const drug = factory.newResource(NS, 'Drug', manufactures.vialId);
    drug.vialId = manufactures.vialId;
    drug.locationStatus = "PRODUCED";
    drug.manufacturedDate = manufactures.manufacturedDate;
    drug.daysInStorage = 0;
    drug.minTemperature = 1;
    drug.maxTemperature = 15;
    drug.protocol = "Trial01";
    drug.dosageLevel = "25mg";
    drug.doseIntervalDays = 14;
    drug.tempAuditRecord = [];

    // add the drug to the registry
    const drugRegistry = await getAssetRegistry('org.metapharma.Drug');
    await drugRegistry.addAll([drug]);

    // emit a notification that a drug was produced
    const newDrugNotification = getFactory().newEvent('org.metapharma', 'NewDrugNotification');
    newDrugNotification.drug = manufactures.drug;
    emit(newDrugNotification);
}

/**
 * Track the packing of a drug at the manufacturer
 * @param {org.metapharma.DrugPack} packing - the asset to be processed
 * @transaction
 */
async function drugPack(packing) { // eslint-disable-line no-unused-vars

    // set the new attributes of the drug
    packing.drug.locationStatus = "PACKED";
    const assetRegistry = await getAssetRegistry('org.metapharma.Drug');

    // emit a notification that a drug was packed
    const drugPacked = getFactory().newEvent('org.metapharma', 'DrugPacked');
    drugPacked.drug = packing.drug;
    emit(drugPacked);

    // persist the state of the drug
    await assetRegistry.update(packing.drug);
}

/**
 * Track the shipment from the manufacturer to the storage facility
 * @param {org.metapharma.BuildsShipment} shipnew - the shipment to be processed
 * @transaction
 */
async function buildShipment(shipnew) { // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.metapharma';

    // create the shipment
    const shipment = factory.newResource(NS, 'Shipment', shipnew.newShipmentId);
    shipment.shipmentId = shipnew.newShipmentId;
    shipment.shipmentTemperature = shipnew.shipmentTemperature;
    shipment.shipped = shipnew.shippedDate;
    shipment.truckId = shipnew.truckId;
    shipment.drug = shipnew.drug;
    shipment.shipper = shipnew.shipper;
    shipment.receiver = shipnew.receiver;
    shipment.courier = shipnew.courier;
    shipment.contract = shipnew.contract;

    // Perform temperature audit of drug, update the location status of the drug
    const drugRegistry = await getAssetRegistry(NS + '.Drug');
    if (shipnew.shipmentTemperature > shipment.drug.minTemperature &&
      shipnew.shipmentTemperature < shipment.drug.maxTemperature) {
      shipnew.drug.locationStatus = "IN_TRANSIT_TO_STORAGE";
      shipment.status = "IN_TRANSIT";
    } else {shipnew.drug.locationStatus = "DISCARDED";
            shipment.status = "ABORTED";
           }

    //Push the temperature value to the drug asset's record
    shipment.drug.tempAuditRecord.push(shipnew.shipmentTemperature);

    //Add shipment to asset registry
    const shipRegistry = await getAssetRegistry('org.metapharma.Shipment');
    await shipRegistry.addAll([shipment]);

    // emit a notification that a shipment was created
    const shipNotification = getFactory().newEvent('org.metapharma', 'ShipNotification');
    shipNotification.shipment = shipnew.shipment;
    emit(shipNotification);

    // persist the state of the drug
    await drugRegistry.update(shipnew.drug);
}

/**
 * Track the receipt of the shipment at the storage facility
 * @param {org.metapharma.StorageReceive} receipt - the shipment to be processed
 * @transaction
 */
async function storageReceive(receipt) { // eslint-disable-line no-unused-vars

    // set the new attributes of the shipment
    const shipment = receipt.shipment;
    const contract = receipt.shipment.contract;
    shipment.status = "ARRIVED";
    shipment.received = receipt.receivedDate;
    shipment.signature = receipt.signature;
    shipment.receiptTemperature = receipt.receiptTemperature;
    const shipRegistry = await getAssetRegistry('org.metapharma.Shipment');


    // Perform temperature audit of drug, update the location status of the drug
    const drugRegistry = await getAssetRegistry('org.metapharma.Drug');
    if (receipt.receiptTemperature > shipment.drug.minTemperature &&
      receipt.receiptTemperature < shipment.drug.maxTemperature) {
      shipment.drug.locationStatus = "STORAGE";
    // Award payment to courier, provided a successful temp audit
    contract.payer.accountBalance -= contract.payment;
    shipment.courier.accountBalance += contract.payment;
        } else {shipment.drug.locationStatus = "DISCARDED";
                     }
    // Add the storage of the drug's timestamp to drug asset
    shipment.drug.storageReceived = receipt.receivedDate;

    //Push the temperature value to the drug asset's record
    shipment.drug.tempAuditRecord.push(receipt.receiptTemperature);

    // persist the state of the drug
    await drugRegistry.update(shipment.drug);

    // emit a notification that a shipment was received
    const receiptNotification = getFactory().newEvent('org.metapharma', 'ReceiptNotification');
    receiptNotification.shipment = shipment;
    emit(receiptNotification);

    // persist the state of assets and participants
    await shipRegistry.update(shipment);
    const payerRegistry = await getParticipantRegistry('org.metapharma.Business');
    await payerRegistry.update(contract.payer);
    const payeeRegistry = await getParticipantRegistry('org.metapharma.Business');
    await payeeRegistry.update(shipment.courier);
}

/**
 * Track the shipment from the storage facility to a hospital
 * @param {org.metapharma.ToHospitalShip} shipnew - the shipment to be processed
 * @transaction
 */
async function toHospitalShip(shipnew) { // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.metapharma';

    // create the shipment
    const shipment = factory.newResource(NS, 'Shipment', shipnew.newShipmentId);
    shipment.shipmentId = shipnew.newShipmentId;
    shipment.shipmentTemperature = shipnew.shipmentTemperature;
    shipment.shipped = shipnew.shippedDate;
    shipment.truckId = shipnew.truckId;
    shipment.drug = shipnew.drug;
    shipment.shipper = shipnew.shipper;
    shipment.receiver = shipnew.receiver;
    shipment.courier = shipnew.courier;
    shipment.contract = shipnew.contract;

    // Perform temperature audit of drug, update the location status of the drug
    const drugRegistry = await getAssetRegistry(NS + '.Drug');
    if (shipnew.shipmentTemperature > shipment.drug.minTemperature &&
      shipnew.shipmentTemperature < shipment.drug.maxTemperature) {
      shipnew.drug.locationStatus = "IN_TRANSIT_TO_HOSPITAL";
      shipment.status = "IN_TRANSIT";
    } else {shipnew.drug.locationStatus = "DISCARDED";
            shipment.status = "ABORTED";
           }
    // Add the drug's end of storage timestamp to drug asset
    shipment.drug.storageShipped = shipnew.shippedDate;

    //Push the temperature value to the drug asset's record
    shipment.drug.tempAuditRecord.push(shipnew.shipmentTemperature);

  // Calculate the drug's time spent in storage
    let start = shipment.drug.storageReceived;
    let end = shipnew.shippedDate;
    let millitime = end - start;
    let daystime = millitime / 86400000;
    let daysrounded = Math.round(daystime);
    shipment.drug.daysInStorage = daysrounded;

    //Add shipment to asset registry
    const shipRegistry = await getAssetRegistry('org.metapharma.Shipment');
    await shipRegistry.addAll([shipment]);

    // emit a notification that a shipment was created
    const shipNotification = getFactory().newEvent('org.metapharma', 'ShipNotification');
    shipNotification.shipment = shipnew.shipment;
    emit(shipNotification);

    // persist the state of the drug
    await drugRegistry.update(shipnew.drug);
}


/**
 * Track the receipt of the drug from storage at the hospital
 * @param {org.metapharma.HospitalReceive} shipmentreceived - the shipment to be processed
 * @transaction
 */
 async function hospitalReceive(receipt) { // eslint-disable-line no-unused-vars

    // set the new attributes of the shipment
    const shipment = receipt.shipment;
    const contract = receipt.shipment.contract;
    shipment.status = "ARRIVED";
    shipment.received = receipt.receivedDate;
    shipment.signature = receipt.signature;
    shipment.receiptTemperature = receipt.receiptTemperature;
    const shipRegistry = await getAssetRegistry('org.metapharma.Shipment');


    // Perform temperature audit of drug, update the location status of the drug
    const drugRegistry = await getAssetRegistry('org.metapharma.Drug');
    if (receipt.receiptTemperature > shipment.drug.minTemperature &&
      receipt.receiptTemperature < shipment.drug.maxTemperature) {
      shipment.drug.locationStatus = "HOSPITAL";
    // Award payment to courier, provided a successful temp audit
    contract.payer.accountBalance -= contract.payment;
    shipment.courier.accountBalance += contract.payment;
        } else {shipment.drug.locationStatus = "DISCARDED";
                     }
    //Push the temperature value to the drug asset's record
    shipment.drug.tempAuditRecord.push(receipt.receiptTemperature);

    // persist the state of the drug
    await drugRegistry.update(shipment.drug);

    // emit a notification that a shipment was received
    const receiptNotification = getFactory().newEvent('org.metapharma', 'ReceiptNotification');
    receiptNotification.shipment = receipt.shipment;
    emit(receiptNotification);

    // persist the state of the shipment and participants
    await shipRegistry.update(receipt.shipment);
    const payerRegistry = await getParticipantRegistry('org.metapharma.Business');
    await payerRegistry.update(contract.payer);
    const payeeRegistry = await getParticipantRegistry('org.metapharma.Business');
    await payeeRegistry.update(shipment.courier);
}

/**
 * Perform a temperature audit at the Storage Facility
 * @param {org.metapharma.TempAudit} audit - the drug to be unpacked
 * @transaction
 */
async function tempAudit(audit) { // eslint-disable-line no-unused-vars

    // set the new attributes of the drug
    if (audit.temperatureReading > audit.drug.minTemperature &&
      audit.temperatureReading < audit.drug.maxTemperature) {
  audit.drug.locationStatus = "STORAGE";
} else {audit.drug.locationStatus = "DISCARDED";
           }
    const assetRegistry = await getAssetRegistry('org.metapharma.Drug');

    //Push the temperature value to the drug asset's record
    audit.drug.tempAuditRecord.push(audit.temperatureReading);

    // emit a notification that a drug was audited
    const tempAudit = getFactory().newEvent('org.metapharma', 'TempAuditNotification');
    tempAudit.drug = audit.drug;
    emit(tempAudit);

    // persist the state of the drug
    await assetRegistry.update(audit.drug);
}

/**
 * Track the unpacking of the drug and the hospital and update status to
 * indicate it is ready for use
 * @param {org.metapharma.DrugUnpack} unpack - the drug to be unpacked
 * @transaction
 */
async function drugUnpack(unpack) { // eslint-disable-line no-unused-vars

    // set the new attributes of the drug
    if (unpack.temperatureReading > unpack.drug.minTemperature &&
      unpack.temperatureReading < unpack.drug.maxTemperature) {
  unpack.drug.locationStatus = "READY_FOR_USE";
    } else {unpack.drug.locationStatus = "DISCARDED";
           }
    const assetRegistry = await getAssetRegistry('org.metapharma.Drug');

    //Push the temperature value to the drug asset's record
    unpack.drug.tempAuditRecord.push(unpack.temperatureReading);

    // emit a notification that a drug was unpacked
    const drugUnpacked = getFactory().newEvent('org.metapharma', 'DrugUnpacked');
    drugUnpacked.drug = unpack.drug;
    emit(drugUnpacked);

    // persist the state of the drug
    await assetRegistry.update(unpack.drug);
}

/**
 * Track the injection of the drug
 * @param {org.metapharma.Injection} injection - the injection to be processed
 * @transaction
 */
async function InjectionReceipt(injection) { // eslint-disable-line no-unused-vars

    // set the new location status of the drug
    const drugRegistry = await getAssetRegistry('org.metapharma.Drug');
    injection.drug.locationStatus = "INJECTED";

    // update the number of doses the patient has received
    const patientRegistry = await getAssetRegistry('org.metapharma.Patient');
    let injectionsReceived = injection.patient.injectionsReceived;
    injectionsReceived ++;
    injection.patient.injectionsReceived = injectionsReceived;
    if (injectionsReceived == 5) {
      injection.patient.status = "COMPLETED_SUCCESSFULLY"
    } else {
      injection.patient.status = "IN_TRIAL"}

    // log the injection timestamp into the patient's record
    let timestamp = injection.timeAdministered;
    if (injection.patient.firstInjection == null) {
      injection.patient.firstInjection = timestamp;
    } else {if (injection.patient.secondInjection == null) {
      injection.patient.secondInjection = timestamp;
    } else {if (injection.patient.thirdInjection == null) {
      injection.patient.thirdInjection = timestamp;
    } else {if (injection.patient.fourthInjection == null) {
      injection.patient.fourthInjection = timestamp;
    } else {injection.patient.fifthInjection = timestamp;
    }}}

    // Schedule the next dosage for the patient
    if (injection.patient.injectionsReceived < 5 || injection.patient.injectionsReceived == null) {
    let target = new Date();
    let doseInterval = injection.drug.doseIntervalDays;
    target.setDate(target.getDate() + doseInterval);
      let appointment = target.toString();
    injection.patient.nextDose = appointment;
    } else {injection.patient.nextDose = null;
    }
    }

    // emit a notification that an injection was received
    const injectionNotification = getFactory().newEvent('org.metapharma', 'InjectionNotification');
    injectionNotification.drug = injection.drug;
    injectionNotification.patient = injection.patient;
    emit(injectionNotification);

    // persist the state of the assets
    await drugRegistry.update(injection.drug);
    await patientRegistry.update(injection.patient);

}
