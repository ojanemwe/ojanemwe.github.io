function postContactToGoogle() {
    var nama = $('#fullname').val();
    var email = $('#email').val();
    var judul = $('#judul').val();
    var pesan = $('#pesan').val();
    var filess = $('#uploadfile').val();
    if ((nama === "") || (email === "") || (judul === "") || (pesan === "")) {
        alert("Mohon isi Formulir dengan Lengkap");
        return false;
    }

    $.ajax({
        url: "https://docs.google.com/forms/d/e/1FAIpQLScNCGN1UP1kZQg81mDyXBy1KWmCeWdW1AGdlK8Afflg7onz5Q/formResponse",
        data: {
            "entry_1047620410": nama,
            "entry_584369713": email,
            "entry_274872785": judul,
            "entry_805275512": pesan,
            "entry_1232471373": filess
        },
        type: "POST",
        dataType: "xml",
        statusCode: {
            0: function () {
                window.location.replace("thankyou.html");
            },
            200: function () {
                window.location.replace("thankyou.html");
            }
        }
    });
}

function validateEmail(emailField) {
    var reg = /^([A-Za-z0-9_\-\.])+\@([A-Za-z0-9_\-\.])+\.([A-Za-z]{2,4})$/;
    if (reg.test(emailField.value) == false) {
        alert('Alamat Email Tidak Valid');
        return false;
    }
    return true;
}