// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 I declare that this code was written by me. 
 I will not copy or allow others to copy my code. 
 I understand that copying code is considered as plagiarism.
 
 Student Name: Chow Sherwin
 Student ID: 24046565
 Class: C002 - Team 4
 Date created: December 2025
 */

contract PetContract{

// State user defined data types using ENUM. Semicolon not required

	enum PetStatus{ Sold, Available}


// State variables declared outside the function inside the contract
// Stored on the blockchain.

    string private welcomeMessage = "Welcome to Chow Sherwin RP-PetShop"; // Week 06 Task
    string public companyNameAddress;
    uint petCount;


// Constructor code is only run when the contract is created

    constructor() {
        petCount=0;
        companyNameAddress = "Chow Sherwin Pet Shop, 9 Woodlands Avenue 9, Singapore 738964";
    }

// Define Struct required for Pet Shop

    struct PetData { 
			string id;
            string name;
            string gender;
            string dateOfBirth;
    }

    struct BreederAndShelterData { 
			string name;
            string companyAddress;
            string licenseNumber;
            string phone;
            string email;
    }


    struct AdoptionData { 
			string agreementId;
            string adopterName;
            string dateSigned;
            string returnPolicy;
            uint256 adoptionFee;
    }


    struct InsuranceData { 
			string policyNumber;
            string provider;
            string coverageType;
            uint256 maxClaimAmount;
            uint256 premium;
            string claimId;
            uint256 amountClaimed;
            string claimDate;
            string status;
    }


    struct OwnershipData { 
			string ownerId;
            string ownerName;
            string transferDate;
            string phone;
            string email;
    }


    struct VaccinationData { 
			string vaccineName;
            string dateAdministered;
            string doctorname;
            string clinic;
            string phone;
            string email;
    }


    struct TrainingData { 
			string trainingType;
            string trainerName;
            string organization;
            string phone;
            string trainingDate;
            string progress;
    }



//structure of the Pet struct, 7 Data Categories
    struct Pet {
        PetData petRecord;
        BreederAndShelterData breederAndShelterRecord;
        AdoptionData adoptionRecord;
        InsuranceData  insuranceRecord;
        OwnershipData[] ownershipRecord;
        VaccinationData[] vaccinationRecord;
        TrainingData[] trainingRecord;
    }

    mapping(uint256 => Pet) public pets;
 

// View does not modify the state variable welcomeMessage
    function getWelcomeMessage() public view returns (string memory) 
    {
        return welcomeMessage;
    }


    function getCompanyNameAddress() public view returns(string memory){
        return companyNameAddress;
    }

    //Write a function getPetCount to obtain the petCount
    function getPetCount() public view returns (uint) {
        return  petCount;
    }


    function registerPet() public returns (uint256) {
        petCount++;
        return petCount;
    }

// Define functions for the Pet Shop

    // Function to add pet  data
// Define functions for the Pet Shop

// Define the Add functions
    // Function to add pet  data (NOT in Array) Use this as guide
    function addPetData(
        uint256 petId,
        string memory _id,
        string memory _name,
        string memory _gender,
        string memory _dateOfBirth
    ) public {
        pets[petId].petRecord = PetData(_id, _name, _gender, _dateOfBirth);
    }

    // Function to add breeder and shelter company information (NOT in Array)
    function addBreederShelterData(
        uint256 petId, 
        string memory _name,
        string memory _companyAddress,
        string memory _licenseNumber,
        string memory _phone,
        string memory _email 
        ) public {
            pets[petId].breederAndShelterRecord= BreederAndShelterData(
                _name, _companyAddress, _licenseNumber, _phone, _email);
      }

    // Function to add a new ownership  (in array)
    function addOwnerShipData (uint256 petId, 
        string memory _ownerId,
        string memory _ownerName,
        string memory _transferDate,
        string memory _phone,
        string memory _email ) public {
            pets[petId].ownershipRecord.push(OwnershipData(
                _ownerId, _ownerName, _transferDate, _phone, _email));
    }

    // Function to add a new vaccination data (in array)
    function addVaccinationData(uint256 petId, 
        string memory _vaccineName,
        string memory _dateAdministered,
        string memory _doctorname,
        string memory _clinic,
        string memory _phone,
        string memory _email) public {
            pets[petId].vaccinationRecord.push(VaccinationData(
                _vaccineName, _dateAdministered, _doctorname, _clinic, _phone, _email));
    }

    // Function to add adoption agreement ( Notin array)
    function addAdoptionData (uint256 petId, 
        string memory _agreementId,
        string memory _adopterName,
        string memory _dateSigned,
        string memory _returnPolicy,
        uint256 _adoptionFee) public {
            pets[petId].adoptionRecord = AdoptionData(
                _agreementId, _adopterName, _dateSigned, _returnPolicy, _adoptionFee);

    }

    // Function to add insurance info (Not in array)
    function addInsuranceData (uint256 petId, 
       string memory _policyNumber,
        string memory _provider,
        string memory _coverageType,
        uint256 _maxClaimAmount,
        uint256 _premium,
        string memory _claimId,
        uint256 _amountClaimed,
        string memory _claimDate,
        string memory _status) public {
            pets[petId].insuranceRecord = InsuranceData(
                _policyNumber, _provider, _coverageType, _maxClaimAmount, _premium, _claimId, _amountClaimed, _claimDate, _status);

    }

    // Function to add a new Training info  (in array)
    function addTrainingData (uint256 petId, 
         string memory _trainingType,
        string memory _trainerName,
        string memory _organization,
        string memory _phone,
        string memory _trainingDate,
        string memory _progress) public {
            pets[petId].trainingRecord.push(TrainingData(
                _trainingType, _trainerName, _organization, _phone, _trainingDate, _progress));

    }



	// Function for Getters
// Function for Getters
     // Function to retrieve pet  information
    function getPetRecord(uint256 petId) public view returns (PetData memory) {
        return pets[petId].petRecord;
    }

    // Function to retrieve ownership records
    function getBreederShelterRecord(uint256 petId) public view returns (BreederAndShelterData memory) {
        return pets[petId].breederAndShelterRecord;
    }

    // Function to retrieve ownership records
    function getOwnershipRecord(uint256 petId) public view returns (OwnershipData[] memory) {
        return pets[petId].ownershipRecord;
    }

    // Function to retrieve vaccination records
    function getVaccinationRecord(uint256 petId) public view returns (VaccinationData[] memory) {
        return pets[petId].vaccinationRecord;
    }

    // Function to retrieve adoption agreement details
    function getAdoptionRecord(uint256 petId) public view returns (AdoptionData memory) {
        return pets[petId].adoptionRecord;
    }

    // Function to retrieve insurance data
    function getInsuranceRecord(uint256 petId) public view returns (InsuranceData memory) {
        return pets[petId].insuranceRecord;
    }

    // Function to retrieve training records
    function getTrainingRecord(uint256 petId) public view returns (TrainingData[] memory) {
        return pets[petId].trainingRecord;
    }
}

