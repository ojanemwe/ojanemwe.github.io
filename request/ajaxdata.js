function postContactToGoogle() {
    var idproj=$('#idpro').val();
    var nama=$('#fullname').val();
    var email=$('#email').val();
    var nohp=$('#nohp').val();
    var jasa=$('#jasa').find(":selected").text();
    //var jasa=$('#jasa').find("select").text();
    var deadline=$('#deadline').val();
    var budget=$('#budget').val();
    var jrev=$('#jrev').val();
    var desk=$('#desk').val();
    var filess=$('#namafile').val();
    if ((nama === "") || (email === "") || (nohp === "") || (jasa === "") || (deadline === "")) {
        alert("Mohon isi Formulir dengan Lengkap");
        return false;
    }
    
    $.ajax({
    url:"https://docs.google.com/forms/d/e/1FAIpQLScgtjl3m5VIgWB9H8CI5CxRQMA88QMv3cAEDoloRj7Ldh7RsA/formResponse",data:{"entry_1812133934":idproj,"entry_1008445535":nama,"entry_1738818917":email,"entry_849296093":nohp,"entry_590017302":jasa,"entry_1970024731":deadline,"entry_1277689718":budget,"entry_467356245":jrev,"entry_1146694328":desk,"entry_401111394":filess},type:"POST",dataType:"xml",statusCode: {0:function() { window.location.replace("thankyou.html");},200:function(){window.location.replace("thankyou.html");}}
    });
}

function validateEmail(emailField){
        var reg = /^([A-Za-z0-9_\-\.])+\@([A-Za-z0-9_\-\.])+\.([A-Za-z]{2,4})$/;
        if (reg.test(emailField.value) == false) 
        {
            alert('Alamat Email Tidak Valid');
            return false;
        }
        return true;
}