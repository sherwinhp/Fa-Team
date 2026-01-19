const express = require('express');
const {Web3} = require('web3');
const fs = require("fs");
const multer = require('multer');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'public/images'); // Directory to save uploaded files
  },
  filename: (req, file, cb) => {
      cb(null, file.originalname); 
  }
});
const upload = multer({ storage: storage });
//Set up view engine from ejs library
const app = express();
//Set up view engine
app.set('view engine', 'ejs');
//This line of code tells Express to serve static files (such as images, CSS, JavaScript files, or PDFs)
//from the public directory
app.use(express.static('public'))
//enable form processing
app.use(express.urlencoded({
    extended: false
}));

//start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// declare the global variables
var account = '';
var noOfPets=0;
var loading= true;  
var addObj = null;
var addFunc = null;
var addEnabled = null;
var listOfPets = [];   
 
// Define routes - home page
app.get('/', async(req, res) => {   
    console.log("home page");
    console.log(addFunc)
    console.log(noOfPets);
    console.log(listOfPets);
    try {
      //console.log(listOfPets);
      res.render('index', {
            acct: account,
            cnt: noOfPets,
            pets: listOfPets,
            status: loading,
            addObject : JSON.stringify(addObj),
            addFunction : addFunc,
            addStatus : addEnabled
      });
    } catch (error) {
        console.error('Error in home route:', error);
        res.status(500).send('Server error');
    }
});

app.post('/web3ConnectData', express.json(), async (req, res) => {
  try {
    const { petDataRead, contractAddress, acct, nPets } = req.body;
    console.log(petDataRead);
    console.log(contractAddress);
    console.log(acct);
    //console.log(nPets);
    noOfPets = nPets;
    account = acct;
    console.log(nPets);
    listOfPets = [];
    // Create a comprehensive pet object with all related information
    for (let i = 0; i < nPets; i++) {
      console.log(i);
      console.log(petDataRead[i].petInfo);
      console.log(petDataRead[i].ownershipInfo);
      const petData = 
      {        
        id: i+1,
        petInfo : formatPetInfo(petDataRead[i].petInfo),
        ownership: formatOwnershipInfo(petDataRead[i].ownershipInfo),
        vaccinations: formatVaccinationInfo(petDataRead[i].vaccinationInfo),
        training: formatTrainingInfo(petDataRead[i].trainingInfo),
      };
      listOfPets.push(petData);
    }    //console.log(listOfPets);
    loading = false;
    // Send response back to frontend
    res.json({
      success: true,
      data: listOfPets,
      message: 'Pet data processed successfully'
    });
  } catch (error) {
      console.error('Error in web3ConnectData:', error);
      res.status(500).json({
          success: false,
          message: error.message
      });
  }
});

// Helper functions to format different types of data
function formatPetInfo(petInfo) {
  //console.log(petInfo);
  return {
    id: petInfo[0],
    name: petInfo[1],
    dateOfBirth: petInfo[2],
    gender: petInfo[3],
    price: petInfo[4],
    status: petInfo[5],
    // Add any other pet-specific fields
  };
}

function formatOwnershipInfo(ownershipInfo) {
  return ownershipInfo.map(record => ({
    ownerId: record[0],
    ownerName: record[1],
    transferDate: record[2],
    phone: record[3],
    email: record[4],
    // Add any other ownership-specific fields
  }));
}

function formatVaccinationInfo(vaccinationInfo) {
  return vaccinationInfo.map(record => ({
    vaccineName: record[0],
    dateAdministered: record[1],
    doctorname: record[2],
    clinic: record[3],
    phone: record[4],
    email: record[5],
    // Add any other vaccination-specific fields
  }));
}

function formatTrainingInfo(trainingInfo) {
  return trainingInfo.map(record => ({
    trainingType: record[0],
    traninerName: record[1],
    organization: record[2],
    phone: record[3],
    trainingDate: record[4],
    progress: record[5],
    // Add any other training-specific fields
  }));
}

//In your Express app, add this new endpoint:
app.get('/loading-status', (req, res) => {
  res.json({ loading: loading });
});

app.get('/pet/:id', (req, res) => {
  try {
      const petId = req.params.id;
      //console.log("petId ");
      console.log(petId);
      //console.log(listOfPets);
      // Find the index of the pet based on petId
      const index = listOfPets.findIndex(listOfPets => 
                                  listOfPets.id.toString() === petId.toString());
      console.log("get pet information")
      console.log(index)
      console.log(listOfPets[index]);
      if (index === -1) {
        console.log("pet not found");
        return res.status(404).send("Pet not found");
      }
      res.render('pet', {acct: account, petData: listOfPets[index], loading:false});
  }
  catch (error) {
      console.error('Error in pet registration:', error); 
      res.status(500).send('Error finding Pet');
  }
});

// Define routes - to add the pet using the path /addPet
app.get('/addPet', (req, res) => {
  // call the addPet.ejs file for the path /addPet
  res.render('addPet', { acct: account} );   
});

// Define routes - to add the pet using the path /addPet post method for the addPet form
app.post('/addPet', upload.single('image'), async (req, res) => {
  try {
      // Extract data from request body
      const { petId, name, dob, gender, price } = req.body;
   
      // Handle image upload
      const image = req.file ? req.file.filename : null;
      
      // Validate required fields
      if (!petId || !name || !dob || !gender || !price) {
          return res.status(400).json({ 
              error: 'Missing required fields' 
          });
      }
      addFunc = "addPetInfo";
      addEnabled = true;
      //addObj = [ petId, name, dob, gender, price ] ;
       addObj = {'petId': petId,  'name': name, 'dob': dob,
                  'gender': gender, 'price': price };
                  
      console.log(addObj);
      res.redirect('/');   
  } catch (error) {
    console.error('Error in pet registration:', error);
    res.status(500).send('Error adding Pet');
  }
});

app.post('/setFunc', async (req, res) => {
  addEnabled = null;
  res.json({
    success: true,
     message: 'set data successfully'
  });
});

app.get('/addVaccination/:id', (req, res) => {
  const petId = req.params.id;
  res.render('addVaccination', { acct: account, petId : petId} ); 
});

app.post('/addVaccination', async (req, res) => {
  try {
      // Extract data from request body
      const { vaccine, dateOfVaccine, doctor, clinic, contact, emailId, petId } = req.body;
      console.log([vaccine, dateOfVaccine, doctor, clinic, contact, emailId, petId]);
      
      // Validate required fields
      if (!petId || !vaccine || !dateOfVaccine || !doctor || !clinic || !contact || !emailId ) {
          return res.status(400).json({ 
              error: 'Missing required fields' 
          });
      }
      addFunc = "addVaccination";
      addEnabled = true;
 
      addObj = {'petId': petId,  'vaccine': vaccine, 'dateOfVaccine': dateOfVaccine,
                  'doctor': doctor, 'clinic': clinic, 'contact' : contact, 'emailId': emailId };
      res.redirect('/');   
  } catch (error) {
      console.error('Error in adding pet vaccine information:', error);
      res.status(500).send('Error adding Pet vaccine');
  }
});

app.get('/addTraining/:id', (req, res) => {
  const petId = req.params.id;
  res.render('addTraining', { acct: account, petId : petId} ); 
});

app.post('/addTraining', async (req, res) => {
  try {
      // Extract data from request body
      const { trainingType, name, org, trainingDate, contact, progress, petId } = req.body;
      console.log([trainingType, name, org, trainingDate, contact, progress, petId]);
      // Validate required fields
      if (!petId || !name || !org || !trainingDate || !contact || !progress || !trainingType ) {
          return res.status(400).json({ 
              error: 'Missing required fields' 
          });
      }
      addFunc = "addTraining";
      addEnabled = true;
      addObj = {'petId': petId,  'name': name, 'org': org,
                  'trainingDate': trainingDate, 'contact': contact, 'progress': progress, 'trainingType': trainingType };
      res.redirect('/');     
  } catch (error) {
      console.error('Error in pet training information:', error);
      res.status(500).send('Error adding Pet training');
  }
});

app.get('/addOwner/:id', (req, res) => {
  const petId = req.params.id;
  res.render('addOwner', { acct: account, petId : petId} ); 
});

app.post('/addOwner', async (req, res) => {
  try {
      // Extract data from request body
      const { ownerId, name, transferDate, contact, emailId, petId } = req.body;
      console.log([ownerId, name, transferDate, contact, emailId, petId]);
      // Validate required fields
      if (!petId || !name || !ownerId || !transferDate || !contact || !emailId ) {
          return res.status(400).json({ 
              error: 'Missing required fields' 
          });
      }
      addFunc = "addOwner";
      addEnabled = true;
      addObj = {'petId': petId,  'name': name, 'ownerId': ownerId,
                  'transferDate': transferDate, 'contact': contact, 'emailId' :emailId };
      res.redirect('/');     
    } catch (error) {
      console.error('Error in pet owner information:', error);
      res.status(500).send('Error adding Pet owner');
    }
});

app.post('/buyPet/:id', (req, res) => {
  try {
      const  petId   = req.params.id;
      console.log(petId) 
      const {petCost} = req.body;
      if (!petId  || !petCost) {
        return res.status(400).json({ 
            error: 'Missing required fields' 
        });
      } 
      addFunc = "buyPet";
      addEnabled = true;
      addObj = {'petId': petId, 'petCost': petCost};  
      res.redirect('/');  
  }catch (error) {
    console.error('Error in pet id for buy pet:', error);
    res.status(500).send('Error buy Pet ');
  }
});
