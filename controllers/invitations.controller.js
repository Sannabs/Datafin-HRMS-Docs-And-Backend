export const  sendInvitation = async (req, res, next) => {
    const { email, role } = req.body
    const tenantId = req.user.tenantId
    const senderId = req.user.id
    const senderRole = req.user.role
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48) // 48 hours


    if(!tenantId || !senderId) return res.status(400).json({success: false, message: "sender id and tenant"})
    try {
        
    } catch (error) {
        
    }
}