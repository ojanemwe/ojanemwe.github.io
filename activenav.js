$(function () {
    $('table tr#menuss td').on('click', function () {
        $(this).parent().find('a.active').removeClass('active');
        $(this).find('a').addClass('active');
    });
});