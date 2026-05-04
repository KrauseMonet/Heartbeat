useEffect(()=>{
  let redirectUser = null;

  const handleRedirect = import("firebase/auth").then(({getRedirectResult})=>
    getRedirectResult(auth).then(async result=>{
      if(!result?.user) return;
      redirectUser = result.user;
      const u = result.user;
      setUser(u);
      const snap = await getDoc(doc(db,"users",u.uid));
      if(!snap.exists()) await setDoc(doc(db,"users",u.uid),{
        name:u.displayName||"",photo:u.photoURL||"",
        status:"",timezone:"",birthday:"",
        favoriteEmoji:"♥",roomId:null,userKey:null,onboardingDone:false
      });
      const freshSnap = await getDoc(doc(db,"users",u.uid));
      if(freshSnap.exists()&&freshSnap.data().roomId){
        setMyUser(freshSnap.data());
        setRoomId(freshSnap.data().roomId);
        setUserKey(freshSnap.data().userKey);
        requestNotifPermission(u.uid);
      } else {
        setMyUser(freshSnap.data()||{name:u.displayName||"",photo:u.photoURL||""});
        if(!freshSnap.exists()||!freshSnap.data().onboardingDone) setShowOnb(true);
        setAppState("profile-setup");
      }
    }).catch(e=>console.error("Redirect error:",e))
  );

  const unsub = onAuthStateChanged(auth, async u=>{
    await handleRedirect.catch(()=>{});
    if(redirectUser) return; // Redirect already handled navigation
    if(!u){ setAppState("login"); return; }
    setUser(u);
    const snap = await getDoc(doc(db,"users",u.uid));
    if(!snap.exists()||!snap.data().roomId){
      if(!snap.exists()||!snap.data().onboardingDone) setShowOnb(true);
      setMyUser(snap.data()||{name:u.displayName||"",photo:u.photoURL||""});
      setAppState("profile-setup"); return;
    }
    const ud = snap.data();
    setMyUser(ud); setRoomId(ud.roomId); setUserKey(ud.userKey);
    requestNotifPermission(u.uid);
  });

  return unsub;
},[]);
